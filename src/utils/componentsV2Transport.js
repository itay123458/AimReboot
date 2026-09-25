import { renderMessage, readEditableMessageEmbeds } from './componentsV2.js';

const INSTALLED = Symbol('aimrebootComponentsV2');

// A client-local adapter covers slash/prefix replies, collectors, DMs and jobs.
export function installComponentsV2(client) {
  if (client[INSTALLED]) return;
  client[INSTALLED] = true;
  const request = client.rest.request.bind(client.rest);
  const interactions = new Map();
  const pendingEdits = new Map();
  client.prependListener('interactionCreate', interaction => {
    if (!interaction.message) return;
    interactions.set(interaction.id, { message: interaction.message, expires: Date.now() + 15 * 60_000 });
    while (interactions.size > 1000) interactions.delete(interactions.keys().next().value);
  });

  async function send(options) {
    const route = options.fullRoute || '';
    const method = options.method;
    const callback = route.match(/^\/interactions\/(\d+)\/[^/]+\/callback$/);
    if (callback && method === 'POST' && [4, 7].includes(options.body?.type)) {
      const update = options.body.type === 7;
      const cached = interactions.get(callback[1]);
      const existing = cached?.expires > Date.now() ? cached.message : undefined;
      if (update && !existing) throw new Error('Cannot update a V2 message without its interaction source.');
      if (update) await readEditableMessageEmbeds(existing);
      const rendered = renderMessage(options.body.data, { existing: update ? existing : undefined,
        edit: update, files: options.files, defaultMentions: ['users'] });
      return request({ ...options, body: { ...options.body, data: rendered.body }, files: rendered.files });
    }
    const channel = /^\/channels\/\d+\/messages(?:\/\d+)?$/.test(route);
    const webhook = /^\/webhooks\/\d+\/[^/]+(?:\/messages\/(?:\d+|@original))?$/.test(route);
    if (!(channel || webhook) || !['POST', 'PATCH'].includes(method) || !options.body) return request(options);
    const edit = method === 'PATCH';
    let existing;
    if (edit) {
      try {
        existing = await request({ ...options, method: 'GET', body: undefined, files: undefined });
      } catch (error) {
        // Editing our own message is permitted even without Read Message History.
        const [, channelId, messageId] = route.match(/^\/channels\/(\d+)\/messages\/(\d+)$/) || [];
        existing = error.status === 403 && client.channels?.cache?.get(channelId)?.messages?.cache?.get(messageId);
        if (!existing) throw error;
      }
    }
    if (existing) await readEditableMessageEmbeds(existing);
    const rendered = renderMessage(options.body, { existing, edit, files: options.files,
      defaultMentions: channel ? ['users', 'roles', 'everyone'] : ['users'] });
    return request({ ...options, body: rendered.body, files: rendered.files });
  }

  client.rest.request = options => {
    if (options.method !== 'PATCH') return send(options);
    const key = options.fullRoute;
    const previous = pendingEdits.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => send(options));
    pendingEdits.set(key, current);
    current.finally(() => { if (pendingEdits.get(key) === current) pendingEdits.delete(key); }).catch(() => {});
    return current;
  };
}
