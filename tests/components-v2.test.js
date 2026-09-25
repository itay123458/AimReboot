import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { renderMessage, readMessageEmbeds, readEditableMessageEmbeds, readMessageContent, getActionRows, walkComponents, V2_FLAG } from '../src/utils/componentsV2.js';
import { Client, Attachment, Collection, ContainerBuilder } from 'discord.js';
import { installComponentsV2 } from '../src/utils/componentsV2Transport.js';

const buttonRow = { type: 1, components: [{ type: 2, style: 1, label: 'Claim', custom_id: 'ticket_claim' }] };
const card = { title: 'Ticket #123', description: 'A request', color: 0xD4AF37,
  fields: [{ name: 'Status', value: '🟢 Open', inline: true }, { name: 'Claimed By', value: 'Not claimed', inline: true }],
  thumbnail: { url: 'https://example.com/avatar.png' }, image: { url: 'https://example.com/banner.png' },
  footer: { text: 'AimReboot • Ticket ID: 123' } };

function message(body) { return { id: '123', flags: body.flags, components: body.components, attachments: body.attachments || [] }; }

test('cards become V2 containers with galleries, thumbnails, separators and nested controls', () => {
  const result = renderMessage({ embeds: [card], components: [buttonRow], flags: 64 });
  assert(result.body.flags & V2_FLAG);
  assert(result.body.flags & 64);
  assert.equal(result.body.embeds, undefined);
  assert.equal(result.body.content, undefined);
  assert.equal(result.body.components[0].type, 17);
  assert.equal(result.body.components[0].accent_color, 0xD4AF37);
  const nodes = [...walkComponents(result.body.components)];
  for (const type of [9, 10, 11, 12, 14, 1, 2]) assert(nodes.some(node => node.type === type));
  assert.equal(getActionRows(result.body.components)[0].components[0].custom_id, 'ticket_claim');
});

test('V2 message data can be read after restart without a cache', () => {
  const rendered = renderMessage({ embeds: [card], components: [buttonRow] });
  const [read] = readMessageEmbeds(JSON.parse(JSON.stringify(message(rendered.body))));
  assert.equal(read.title, card.title);
  assert.equal(read.description, card.description);
  assert.deepEqual(read.fields, card.fields);
  assert.equal(read.image.url, card.image.url);
  assert.equal(read.thumbnail.url, card.thumbnail.url);
  assert.equal(read.footer.text, card.footer.text);
  assert.equal(readMessageEmbeds({ embeds: [card] })[0].title, card.title);
});

test('field reader handles multiline names, emoji and markdown inside values', () => {
  const embed = { title: 'Fields', fields: [{ name: '⭐ **\nName', value: '**Heading**\nbody\n\n### Nested heading', inline: false }] };
  const result = renderMessage({ embeds: [embed] });
  assert.deepEqual(readMessageEmbeds(message(result.body))[0].fields, embed.fields);
});

test('partial edits keep card content and can remove or disable controls', () => {
  const original = message(renderMessage({ embeds: [card], components: [buttonRow] }).body);
  const cleared = renderMessage({ components: [] }, { existing: original, edit: true }).body;
  assert.equal(getActionRows(cleared.components).length, 0);
  assert.equal(readMessageEmbeds(message(cleared))[0].title, card.title);
  assert.equal(cleared.content, null);
  assert.deepEqual(cleared.embeds, []);
  const disabled = structuredClone(buttonRow); disabled.components[0].disabled = true;
  const updated = renderMessage({ components: [disabled] }, { existing: original, edit: true }).body;
  assert(getActionRows(updated.components)[0].components[0].disabled);
  const replaced = renderMessage({ embeds: [{ title: 'Ticket Closed' }] }, { existing: original, edit: true }).body;
  assert.equal(readMessageEmbeds(message(replaced))[0].title, 'Ticket Closed');
  assert.equal(getActionRows(replaced.components).length, 1);
});

test('legacy edits migrate and existing V2 content edits remain V2', () => {
  const migrated = renderMessage({ embeds: [card] }, { edit: true, existing: { embeds: [card], components: [buttonRow], content: 'Ping' } }).body;
  assert.equal(getActionRows(migrated.components).length, 1);
  const changed = renderMessage({ content: 'Expired' }, { edit: true, existing: message(migrated) }).body;
  assert(changed.flags & V2_FLAG);
  assert([...walkComponents(changed.components)].some(node => node.content === 'Expired'));
});

test('attachments are explicitly exposed, image attachments are not duplicated', () => {
  const files = [{ name: 'report.txt', data: Buffer.from('report') }, { name: 'banner.png', data: Buffer.from('png') }];
  const result = renderMessage({ embeds: [{ title: 'Files', image: { url: 'attachment://banner.png' } }],
    attachments: [{ id: '0' }, { id: '1' }] }, { files });
  const fileNodes = [...walkComponents(result.body.components)].filter(node => node.type === 13);
  assert.equal(fileNodes.length, 1);
  assert.equal(fileNodes[0].file.url, 'attachment://report.txt');
  assert.equal(result.files.length, 2);
});

test('large cards remain V2 and retain all text in an exposed attachment', () => {
  const large = { title: 'Large', description: 'x'.repeat(4096), fields: Array.from({ length: 25 }, (_, i) => ({ name: `Field ${i}`, value: 'Details' })) };
  const result = renderMessage({ embeds: [large], components: [buttonRow] });
  const nodes = [...walkComponents(result.body.components)];
  assert(nodes.length <= 40);
  assert(nodes.reduce((n, node) => n + (node.type === 10 ? node.content.length : 0), 0) <= 4000);
  assert.equal(getActionRows(result.body.components)[0].components[0].custom_id, 'ticket_claim');
  assert(result.files.at(-1).data.toString().includes('x'.repeat(4096)));
  assert(result.files.at(-1).data.toString().includes('Field 24'));
  assert(nodes.some(node => node.type === 13));
});

test('converted embed mentions cannot ping; original content mentions stay allowed', () => {
  const result = renderMessage({ content: '<@123456789012345678>', embeds: [{ description: '<@987654321098765432> @everyone' }] });
  assert.deepEqual(result.body.allowed_mentions.users, ['123456789012345678']);
  assert.deepEqual(result.body.allowed_mentions.parse, []);
  const quiet = renderMessage({ content: '<@123456789012345678>', embeds: [card], allowed_mentions: { parse: [], replied_user: false } });
  assert.deepEqual(quiet.body.allowed_mentions, { parse: [], replied_user: false });
});

test('native polls and explicit V2 payloads are not re-rendered', () => {
  const poll = { content: 'Vote', poll: { question: { text: 'Yes?' } } };
  assert.deepEqual(renderMessage(poll).body, poll);
  const direct = { flags: V2_FLAG, components: [{ type: 10, content: 'Native V2' }] };
  assert.deepEqual(renderMessage(direct).body, direct);
});

function clientFixture(existing = {}) {
  const calls = [];
  const client = new EventEmitter();
  client.rest = { request: async request => { calls.push(request); return request.method === 'GET' ? existing : { id: '123' }; } };
  installComponentsV2(client);
  return { client, calls };
}

test('REST coverage includes channel messages, webhooks and interaction replies', async () => {
  const { client, calls } = clientFixture();
  await client.rest.request({ method: 'POST', fullRoute: '/channels/123/messages', body: { embeds: [card] } });
  await client.rest.request({ method: 'POST', fullRoute: '/webhooks/123/token', body: { embeds: [card] } });
  await client.rest.request({ method: 'POST', fullRoute: '/interactions/123/token/callback', body: { type: 4, data: { embeds: [card], flags: 64 } } });
  assert(calls[0].body.flags & V2_FLAG);
  assert(calls[1].body.flags & V2_FLAG);
  assert(calls[2].body.data.flags & V2_FLAG);
  assert(calls[2].body.data.flags & 64);
  const modal = { type: 9, data: { title: 'Modal', components: [] } };
  await client.rest.request({ method: 'POST', fullRoute: '/interactions/456/token/callback', body: modal });
  assert.deepEqual(calls[3].body, modal);
});

test('PATCH fetches the current message and callback updates use their source', async () => {
  const existing = message(renderMessage({ embeds: [card], components: [buttonRow] }).body);
  const { client, calls } = clientFixture(existing);
  await client.rest.request({ method: 'PATCH', fullRoute: '/channels/123/messages/456', body: { components: [] } });
  assert.equal(calls[0].method, 'GET');
  assert.equal(readMessageEmbeds(message(calls[1].body))[0].title, card.title);
  client.emit('interactionCreate', { id: '789', message: existing });
  await client.rest.request({ method: 'POST', fullRoute: '/interactions/789/token/callback', body: { type: 7, data: { components: [] } } });
  assert.equal(readMessageEmbeds(message(calls[2].body.data))[0].title, card.title);
  assert.equal(getActionRows(calls[2].body.data.components).length, 0);
});

test('real Discord.js sends and edits pass through REST and decode SDK components', async () => {
  const client = new Client({ intents: [] });
  const author = { id: '123456789012345678', username: 'AimReboot', discriminator: '0', bot: true };
  client.user = client.users._add(author);
  const channel = client.channels._add({ id: '234567890123456789', type: 1, recipients: [] });
  let stored;
  client.rest.request = async options => {
    if (options.method === 'GET') return stored;
    stored = { id: '345678901234567890', channel_id: channel.id, author,
      timestamp: new Date().toISOString(), type: 0, content: '', embeds: [], attachments: [],
      ...JSON.parse(JSON.stringify(options.body)) };
    return stored;
  };
  installComponentsV2(client);
  const sent = await channel.send({ embeds: [card], components: [buttonRow] });
  assert(sent.flags.has(V2_FLAG));
  assert.equal(readMessageEmbeds(sent)[0].title, card.title);
  for (const component of stored.components) if (component.type === 17) new ContainerBuilder(component).toJSON();
  const edited = await sent.edit({ components: [] });
  assert.equal(getActionRows(edited.components).length, 0);
  assert.deepEqual(readMessageEmbeds(edited)[0].fields, card.fields);
  client.destroy();
});

test('attachment edits handle SDK collections, CDN media, and explicit removals', () => {
  const raw = { id: '123456789012345678', filename: 'report.txt', size: 10, url: 'https://cdn.discordapp.com/attachments/1/2/report.txt' };
  const existing = message(renderMessage({ content: 'Report', attachments: [{ id: raw.id, filename: raw.filename }] }).body);
  existing.attachments = new Collection([[raw.id, new Attachment(raw)]]);
  existing.components.push({ type: 12, items: [{ media: { url: raw.url, attachment_id: raw.id } }] });
  const file = [...walkComponents(existing.components)].find(node => node.type === 13);
  file.file.url = raw.url;
  const retained = renderMessage({ components: [] }, { existing, edit: true }).body;
  assert.equal(retained.attachments[0].filename, 'report.txt');
  assert.equal([...walkComponents(retained.components)].filter(node => node.type === 13).length, 1);
  const removed = renderMessage({ attachments: [] }, { existing, edit: true }).body;
  assert(![...walkComponents(removed.components)].some(node => [12, 13].includes(node.type)));
  assert.deepEqual(removed.attachments, []);
});

test('oversized panels restore editable fields from their attachment after restart', async () => {
  const original = { ...card, description: 'x'.repeat(4096) };
  const rendered = renderMessage({ content: 'Original content', embeds: [original] });
  const stored = message(rendered.body);
  stored.attachments[0] = { ...stored.attachments[0], id: '123456789012345678', url: 'https://cdn.discordapp.com/attachments/1/2/file.txt' };
  const [recovered] = await readEditableMessageEmbeds(stored, async () => ({ ok: true, text: async () => rendered.files[0].data.toString() }));
  assert.equal(recovered.description, original.description);
  assert.deepEqual(recovered.fields, original.fields);
  assert.equal(readMessageContent(stored), 'Original content');
  const edited = renderMessage({ embeds: [{ title: 'Short replacement' }] }, { existing: stored, edit: true });
  assert.deepEqual(edited.body.attachments, []);
  assert.equal(readMessageEmbeds(message(edited.body))[0].title, 'Short replacement');
  const reflow = renderMessage({ content: 'x'.repeat(4000) }, { existing: stored, edit: true });
  assert.equal(reflow.body.attachments.length, 1);
  assert(reflow.files[0].data.toString().includes('Claimed By'));
});

test('plain text remains readable for transcripts and native polls stay native on edits', () => {
  const stored = message(renderMessage({ content: 'Ticket notification' }).body);
  assert.equal(readMessageContent(stored), 'Ticket notification');
  const patch = { components: [] };
  assert.deepEqual(renderMessage(patch, { existing: { poll: {} }, edit: true }).body, patch);
});

test('overflow content can shrink without stale metadata and control edits preserve its preview', async () => {
  const rendered = renderMessage({ content: 'x'.repeat(2000), embeds: [{ description: 'y'.repeat(2500) }], components: [buttonRow] });
  const stored = message(rendered.body);
  stored.attachments[0] = { ...stored.attachments[0], id: '123456789012345678', url: 'https://cdn.discordapp.com/attachments/1/2/file.txt' };
  await readEditableMessageEmbeds(stored, async () => ({ ok: true, text: async () => rendered.files[0].data.toString() }));
  const before = [...walkComponents(stored.components)].filter(node => node.type === 10).map(node => node.content);
  const cleared = renderMessage({ components: [] }, { existing: stored, edit: true });
  assert.deepEqual([...walkComponents(cleared.body.components)].filter(node => node.type === 10).map(node => node.content), before);
  const small = renderMessage({ content: '' }, { existing: stored, edit: true });
  assert.deepEqual(small.body.attachments, []);
  assert.equal(small.files.length, 0);
  assert.equal(readMessageEmbeds(message(small.body))[0].description, 'y'.repeat(2500));
});

test('user uploads with the overflow filename are preserved and not parsed as metadata', async () => {
  const files = [{ name: 'aimreboot-full-message.txt', data: Buffer.from('User report') }];
  const rendered = renderMessage({ embeds: [card], attachments: [{ id: '0' }] }, { files });
  assert.equal(rendered.body.attachments.length, 1);
  const stored = message(rendered.body);
  await readEditableMessageEmbeds(stored, () => { throw new Error('Must not fetch user file'); });
  const replaced = renderMessage({ embeds: [{ title: 'Replacement' }] }, { existing: stored, edit: true });
  assert.equal(replaced.body.attachments.length, 1);
});
