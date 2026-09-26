import { renderMessage, readEditableMessageEmbeds } from './componentsV2.js';

const INSTALLED = Symbol('aimrebootComponentsV2');
const normalizeRoute = route => (route || '').replace(/\/%40original$/i, '/@original');

// A client-local adapter covers slash/prefix replies, collectors, DMs and jobs.
export function installComponentsV2(client) {
  if (client[INSTALLED]) return;
  client[INSTALLED] = true;
  const request = client.rest.request.bind(client.rest);
  const interactions = new Map();
  const deferredOriginals = new Map();
  const pendingEdits = new Map();
  client.prependListener('interactionCreate', interaction => {
    if (!interaction.message) return;
    interactions.set(interaction.id, { message: interaction.message, expires: Date.now() + 15 * 60_000 });
    while (interactions.size > 1000) interactions.delete(interactions.keys().next().value);
  });

  async function send(options) {
    const route = normalizeRoute(options.fullRoute);
    const method = options.method;
    const callback = route.match(/^\/interactions\/(\d+)\/([^/]+)\/callback$/);
    if (callback && method === 'POST' && [5, 6].includes(options.body?.type)) {
      const result = await request(options);
      const source = interactions.get(callback[1]);
      const message = options.body.type === 5
        ? { content: '', embeds: [], components: [], attachments: [], flags: options.body.data?.flags || 0 }
        : source?.expires > Date.now() ? source.message : undefined;
      // Single-use hints avoid a GET after defer, without reusing stale message
      // state across later edits or interactions from other dashboard users.
      if (message) {
        deferredOriginals.set(callback[2], { message, expires: Date.now() + 15 * 60_000 });
        while (deferredOriginals.size > 1000) deferredOriginals.delete(deferredOriginals.keys().next().value);
      }
      return result;
    }
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
    const webhook = route.match(/^\/webhooks\/\d+\/([^/]+)(?:\/messages\/(\d+|@original))?$/);
    // The first follow-up after defer may populate the original response.
    if (webhook && ['POST', 'DELETE'].includes(method)) deferredOriginals.delete(webhook[1]);
    if (!(channel || webhook) || !['POST', 'PATCH'].includes(method) || !options.body) return request(options);
    const edit = method === 'PATCH';
    let existing;
    if (edit && webhook) {
      const hint = deferredOriginals.get(webhook[1]);
      deferredOriginals.delete(webhook[1]);
      if (webhook[2] === '@original' && hint?.expires > Date.now()) existing = hint.message;
    }
    if (edit && !existing) {
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
    const key = normalizeRoute(options.fullRoute);
    const previous = pendingEdits.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => send(options));
    pendingEdits.set(key, current);
    current.finally(() => { if (pendingEdits.get(key) === current) pendingEdits.delete(key); }).catch(() => {});
    return current;
  };
}
