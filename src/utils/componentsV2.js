import { Embed } from 'discord.js';
import { theme } from '../config/theme.js';

export const V2_FLAG = 1 << 15;
const BASE = 1_000_000;
const STRIDE = 100_000;
const CONTENT_ID = 900_001;
const OVERFLOW_ID = 900_002;
const GOLD = parseInt(theme.gold.slice(1), 16);
const ORIGINAL = Symbol('originalV2Message');
const DATA_MARKER = '\n\n--- AimReboot editable message data v1 ---\n';
const overflowAttachment = message => {
  const marker = [...walkComponents(message?.components)].find(node => node.type === 13 && node.id === OVERFLOW_ID);
  if (!marker) return undefined;
  return [...(message?.attachments?.values?.() || message?.attachments || [])].find(item =>
    String(item.id) === String(marker.file.attachment_id) || item.url === marker.file.url
    || `attachment://${item.filename || item.name}` === marker.file.url);
};
const originalOf = message => message?.[ORIGINAL]?.attachmentId === overflowAttachment(message)?.id
  ? message?.[ORIGINAL] : undefined;
const present = (object, key) => object?.[key] !== undefined;
const json = value => typeof value?.toJSON === 'function' ? value.toJSON() : value;
const flagsOf = value => Number(value?.bitfield ?? value ?? 0);
const text = (content, id) => ({ type: 10, ...(id ? { id } : {}), content });
const separator = () => ({ type: 14, divider: true, spacing: 1 });

export function* walkComponents(components = []) {
  for (const value of components) {
    const node = json(value);
    yield node;
    if (node.components) yield* walkComponents(node.components);
    if (node.accessory) yield* walkComponents([node.accessory]);
  }
}

export function getActionRows(components = []) {
  return [...walkComponents(components)].filter(node => node.type === 1);
}

// Stable numeric IDs identify card parts. Field IDs encode the name length and
// inline flag, allowing exact reads without interpreting user Markdown as data.
function renderEmbed(value, index) {
  const embed = json(value);
  const base = BASE + index * STRIDE;
  const children = [];
  if (embed.image?.url) children.push({ type: 12, id: base + 5, items: [{ media: { url: embed.image.url } }] });
  const heading = [];
  if (embed.author?.name) heading.push(text(`-# ${embed.author.name}`, base + 2));
  if (embed.title) heading.push(text(`## ${embed.title}`, base + 1));
  const thumbnail = embed.thumbnail?.url || embed.author?.icon_url;
  if (thumbnail) {
    if (!heading.length) heading.push(text('## AimReboot'));
    children.push({ type: 9, components: heading, accessory: {
      type: 11, id: base + (embed.thumbnail?.url ? 6 : 8), media: { url: thumbnail },
    } });
  } else children.push(...heading);
  if (embed.description) children.push(text(embed.description, base + 3));
  if (embed.url) children.push(text(`[Open link](${embed.url})`, base + 9));
  if (embed.author?.url) children.push(text(`[Author](${embed.author.url})`, base + 10));
  if (embed.fields?.length) {
    if (children.length) children.push(separator());
    embed.fields.forEach((field, fieldIndex) => {
      const id = base + 10_000 + fieldIndex * 2048 + field.name.length * 2 + Number(field.inline === true);
      children.push(text(`**${field.name}**\n${field.value}`, id));
    });
  }
  if (embed.footer?.text || embed.timestamp) {
    if (children.length) children.push(separator());
    if (embed.footer?.text) children.push(text(`-# ${embed.footer.text}`, base + 4));
    if (embed.timestamp) children.push(text(`-# <t:${Math.floor(new Date(embed.timestamp).getTime() / 1000)}:f>`, base + 7));
  }
  if (!children.length) children.push(text('AimReboot'));
  return { type: 17, id: base, accent_color: embed.color ?? GOLD, components: children };
}

export function readMessageEmbeds(message) {
  if (originalOf(message)) return originalOf(message).embeds.map(data => new Embed(data));
  if (message?.embeds?.length) return message.embeds;
  const result = [];
  for (const container of (message?.components || []).map(json)) {
    if (container.type !== 17 || container.id < BASE || container.id >= BASE + 10 * STRIDE
      || (container.id - BASE) % STRIDE !== 0) continue;
    const data = { color: container.accent_color, fields: [] };
    for (const node of walkComponents(container.components)) {
      const part = node.id - container.id;
      if (part === 1) data.title = node.content.slice(3);
      if (part === 2) data.author = { ...data.author, name: node.content.slice(3) };
      if (part === 3) data.description = node.content;
      if (part === 4) data.footer = { text: node.content.slice(3) };
      if (part === 5) data.image = { url: node.items[0].media.url };
      if (part === 6) data.thumbnail = { url: node.media.url };
      if (part === 7) {
        const timestamp = node.content.match(/<t:(\d+):f>/)?.[1];
        if (timestamp) data.timestamp = new Date(Number(timestamp) * 1000).toISOString();
      }
      if (part === 8) data.author = { ...data.author, icon_url: node.media.url };
      if (part === 9) data.url = node.content.slice('[Open link]('.length, -1);
      if (part === 10) data.author = { ...data.author, url: node.content.slice('[Author]('.length, -1) };
      if (node.type === 10 && part >= 10_000 && part < 10_000 + 25 * 2048) {
        const encoded = (part - 10_000) % 2048;
        const nameLength = Math.floor(encoded / 2);
        data.fields.push({ name: node.content.slice(2, 2 + nameLength), value: node.content.slice(5 + nameLength), inline: Boolean(encoded % 2) });
      }
    }
    result.push(new Embed(data));
  }
  return result;
}

export function readMessageContent(message) {
  return originalOf(message)?.content ?? (message?.content
    || [...walkComponents(message?.components)].find(node => node.id === CONTENT_ID)?.content || '');
}

// Long cards carry their source alongside the human-readable text so edits can
// restore all fields after a restart. Only fetch Discord-hosted attachments.
export async function readEditableMessageEmbeds(message, fetchFile = fetch) {
  if (!message || originalOf(message)) return readMessageEmbeds(message);
  const attachment = overflowAttachment(message);
  if (!attachment) return readMessageEmbeds(message);
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
    throw new Error('Invalid editable message attachment URL.');
  }
  const response = await fetchFile(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Unable to load the full editable message.');
  const contents = await response.text();
  const position = contents.lastIndexOf(DATA_MARKER);
  if (position < 0) throw new Error('Editable message data is missing.');
  const original = JSON.parse(contents.slice(position + DATA_MARKER.length));
  if (typeof original.content !== 'string' || !Array.isArray(original.embeds)) throw new Error('Invalid editable message data.');
  message[ORIGINAL] = { ...original, attachmentId: attachment.id };
  return readMessageEmbeds(message);
}

function withoutControls(components) {
  return components.map(json).filter(node => node.type !== 1).map(node => {
    const copy = structuredClone(node);
    if (copy.components) {
      copy.components = withoutControls(copy.components);
      while (copy.components.at(-1)?.type === 14) copy.components.pop();
    }
    return copy;
  });
}

function controlCopy(row) {
  const copy = structuredClone(json(row));
  for (const node of walkComponents([copy])) delete node.id;
  return copy;
}

function addControls(components, rows) {
  if (!rows.length) return;
  let target = components.findLast(node => node.type === 17);
  if (!target) {
    target = { type: 17, accent_color: GOLD, components: [] };
    components.push(target);
  }
  if (target.components.length) target.components.push(separator());
  target.components.push(...rows.map(controlCopy));
}

function mentionPolicy(content, supplied, defaults) {
  const policy = supplied || { parse: defaults };
  const users = [...new Set([...content.matchAll(/<@!?(\d+)>/g)].map(match => match[1]))];
  const roles = [...new Set([...content.matchAll(/<@&(\d+)>/g)].map(match => match[1]))];
  const parse = policy.parse || [];
  const result = { ...policy, parse: parse.includes('everyone') && /@(?:everyone|here)\b/.test(content) ? ['everyone'] : [] };
  if (parse.includes('users') || policy.users) result.users = users.filter(id => parse.includes('users') || policy.users.includes(id));
  if (parse.includes('roles') || policy.roles) result.roles = roles.filter(id => parse.includes('roles') || policy.roles.includes(id));
  return result;
}

function attachmentList(body, existing, files) {
  const attachments = (body.attachments ?? existing?.attachments ?? []).map(json).map(item => ({
    id: String(item.id), filename: item.filename || item.name || files[Number(item.id)]?.name,
    ...(item.description ? { description: item.description } : {}),
  }));
  files.forEach((file, index) => {
    if (!attachments.some(item => item.id === String(index))) attachments.push({ id: String(index), filename: file.name });
  });
  return attachments;
}

function addFiles(components, attachments) {
  const serialized = JSON.stringify(components);
  for (const attachment of attachments) {
    if (!attachment.filename || serialized.includes(`attachment://${attachment.filename}`)) continue;
    components.push({ type: 13, file: { url: `attachment://${attachment.filename}` }, spoiler: attachment.filename.startsWith('SPOILER_') });
  }
}

// Discord returns CDN URLs for attachment media. Restore attachment references
// on edits, and remove media whose underlying attachment was explicitly removed.
function reconcileAttachments(components, existing, attachments) {
  const previous = [...(existing?.attachments?.values?.() || existing?.attachments || [])].map(json);
  const resolve = media => {
    const old = previous.find(item => String(item.id) === String(media.attachment_id)
      || item.url === media.url || `attachment://${item.filename || item.name}` === media.url);
    const filename = old?.filename || old?.name || (media.url?.startsWith('attachment://') ? media.url.slice(13) : undefined);
    if (!filename) return { url: media.url };
    return attachments.some(item => item.filename === filename) ? { url: `attachment://${filename}` } : null;
  };
  return components.flatMap(node => {
    if (node.type === 13) {
      const file = resolve(node.file);
      return file ? [{ ...node, file }] : [];
    }
    if (node.type === 12) {
      const items = node.items.map(item => ({ ...item, media: resolve(item.media) })).filter(item => item.media);
      return items.length ? [{ ...node, items }] : [];
    }
    if (node.type === 9 && node.accessory?.type === 11) {
      const media = resolve(node.accessory.media);
      if (!media) return node.components;
      node = { ...node, accessory: { ...node.accessory, media } };
    }
    if (node.components) {
      node = { ...node, components: reconcileAttachments(node.components, existing, attachments) };
      if (!node.components.length) return [];
    }
    return [node];
  });
}

function fullText(content, embeds) {
  return [content, ...embeds.map(value => {
    const embed = json(value);
    return [embed.author?.name, embed.title, embed.description, embed.url,
      ...(embed.fields || []).map(field => `${field.name}\n${field.value}`), embed.footer?.text, embed.timestamp,
      embed.image?.url, embed.thumbnail?.url].filter(Boolean).join('\n\n');
  })].filter(Boolean).join('\n\n');
}

export function renderMessage(body, { existing, edit = false, files = [], defaultMentions = ['users', 'roles', 'everyone'] } = {}) {
  if (!body || body.poll || existing?.poll || body.sticker_ids?.length || existing?.sticker_items?.length
    || ((flagsOf(body.flags) | flagsOf(existing?.flags)) & (1 << 13))) return { body, files };
  const explicitV2 = (flagsOf(body.flags) & V2_FLAG) && !body.embeds?.length && !body.content
    && body.components?.some(node => json(node).type !== 1);
  if (explicitV2) return { body: edit ? { ...body, content: null, embeds: [] } : body, files };
  const oldV2 = Boolean(flagsOf(existing?.flags) & V2_FLAG);
  const originalContent = readMessageContent(existing);
  const content = present(body, 'content') ? (body.content || '') : originalContent;
  const embeds = present(body, 'embeds') ? (body.embeds || []) : readMessageEmbeds(existing);
  const rows = present(body, 'components') ? getActionRows(body.components || []) : getActionRows(existing?.components || []);
  const outputFiles = [...files];
  const previousOverflow = overflowAttachment(existing);
  const reflow = present(body, 'embeds') || (originalOf(existing) && present(body, 'content'));
  const attachments = attachmentList(body, existing, outputFiles)
    .filter(item => !reflow || item.id !== String(previousOverflow?.id));
  let components;
  if (oldV2 && !present(body, 'embeds') && !(originalOf(existing) && present(body, 'content'))) {
    components = withoutControls(existing.components || []);
    if (present(body, 'content')) {
      for (const node of walkComponents(components)) {
        if (node.id === CONTENT_ID) node.content = content || '\u200B';
      }
      if (content && ![...walkComponents(components)].some(node => node.id === CONTENT_ID)) components.unshift(text(content, CONTENT_ID));
    }
  } else {
    components = embeds.map(renderEmbed);
    if (content) components.unshift(text(content, CONTENT_ID));
    if (!components.length && !rows.length && !attachments.length) components.push(text('This panel has closed.', CONTENT_ID));
    if (!embeds.length && components.length) components = [{ type: 17, accent_color: GOLD, components }];
  }
  addControls(components, rows);
  components = reconcileAttachments(components, existing, attachments);
  addFiles(components, attachments);
  if (!components.length) components.push(text('This panel has closed.', CONTENT_ID));
  const nodes = [...walkComponents(components)];
  if (nodes.length > 40 || nodes.reduce((size, node) => size + (node.type === 10 ? node.content.length : 0), 0) > 4000) {
    for (let index = attachments.length - 1; index >= 0; index--) {
      if (attachments[index].id === String(previousOverflow?.id)) attachments.splice(index, 1);
    }
    let filename = 'aimreboot-full-message.txt';
    while (attachments.some(item => item.filename === filename)) filename = `full-${filename}`;
    const details = fullText(content, embeds) || nodes.filter(node => node.type === 10).map(node => node.content).join('\n\n');
    const id = String(outputFiles.length);
    const editable = JSON.stringify({ content, embeds: embeds.map(json) });
    outputFiles.push({ name: filename, data: Buffer.from(details + DATA_MARKER + editable, 'utf8') });
    attachments.push({ id, filename });
    const first = json(embeds[0]) || {};
    components = [renderEmbed({ title: first.title || 'AimReboot', color: first.color,
      description: `${details.slice(0, 1200)}\n\n**Full details are included in the attached text file.**` }, 0)];
    addControls(components, rows);
    addFiles(components, attachments);
    const overflow = components.find(node => node.type === 13 && node.file.url === `attachment://${filename}`);
    overflow.id = OVERFLOW_ID;
    if ([...walkComponents(components)].length > 40) throw new RangeError('Message has too many controls and files for Components V2.');
  }
  const result = { ...body, components, flags: flagsOf(body.flags) | (flagsOf(existing?.flags) & (64 | 4096)) | V2_FLAG,
    allowed_mentions: mentionPolicy(body.content || '', body.allowed_mentions, defaultMentions) };
  delete result.content;
  delete result.embeds;
  delete result.tts;
  if (edit) { result.content = null; result.embeds = []; }
  if (attachments.length || present(body, 'attachments') || existing?.attachments?.length || existing?.attachments?.size) result.attachments = attachments;
  return { body: result, files: outputFiles };
}
