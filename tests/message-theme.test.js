import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbedBuilder as NativeEmbedBuilder } from 'discord.js';
import { createEmbed, successEmbed, errorEmbed } from '../src/utils/embeds.js';
import { getColor } from '../src/config/bot.js';
import { createInitialHelpMenu } from '../src/commands/Core/help.js';
import { createAllCommandsMenu, helpCategorySelectMenu } from '../src/handlers/help/helpSelectMenus.js';
import { buildNowPlayingEmbed, buildQueueEmbed } from '../src/services/music/musicEmbeds.js';
import { EmbedBuilder } from '../src/utils/themedEmbed.js';
import { buildStandardLogEmbed } from '../src/utils/logging/logEmbeds.js';
import { renderMessage, readMessageEmbeds, getActionRows, walkComponents } from '../src/utils/componentsV2.js';
import { helpPaginationButton } from '../src/handlers/help/helpButtons.js';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('built-in messages use gold and AimReboot branding', () => {
  const data = createEmbed({ title: '🎫 Community Support', description: 'Choose a topic.' }).toJSON();
  assert.equal(data.color, 0xD4AF37);
  assert.equal(data.title, '🎫 Community Support');
  assert.equal(data.footer.text, 'AimReboot');
  assert.equal(getColor('info'), 0xD4AF37);
  assert.equal(getColor('economy'), 0xD4AF37);
});

test('metadata, icons, markdown, and timestamps survive the shared builder', () => {
  const timestamp = new Date('2026-09-25T12:00:00Z');
  const data = createEmbed({
    title: '🎵 Now Playing', description: '```\n  indented\n```',
    fields: [{ name: '⭐ Rating', value: '⭐⭐⭐⭐⭐', inline: true }],
    footer: { text: 'Page 2 of 4', iconURL: 'https://example.com/icon.png' },
    timestamp,
  }).toJSON();
  assert.equal(data.description, '```\n  indented\n```');
  assert.equal(data.fields[0].value, '⭐⭐⭐⭐⭐');
  assert.equal(data.fields[0].name, '⭐ Rating');
  assert.equal(data.footer.icon_url, 'https://example.com/icon.png');
  assert.equal(data.footer.text, 'AimReboot • Page 2 of 4');
  assert.equal(data.timestamp, timestamp.toISOString());
});

test('status messages remain distinguishable', () => {
  assert.equal(successEmbed('Saved').toJSON().color, 0x65B88A);
  assert.equal(errorEmbed('Failed').toJSON().color, 0xD96C75);
  assert.notEqual(getColor('warning'), getColor('primary'));
});

test('importing bot helpers does not alter native/custom Discord embeds', () => {
  const data = new NativeEmbedBuilder().setTitle('🎨 Custom').setColor('#000000')
    .setFooter({ text: 'My own footer' }).setTimestamp(new Date('2026-01-01')).toJSON();
  assert.equal(data.title, '🎨 Custom');
  assert.equal(data.color, 0);
  assert.equal(data.footer.text, 'My own footer');
  assert.equal(data.timestamp, '2026-01-01T00:00:00.000Z');
});

test('help keeps its working select menu and hides removed links', async () => {
  const menu = await createInitialHelpMenu({ user: { username: 'AimReboot' } });
  assert.equal(menu.embeds[0].toJSON().color, 0xD4AF37);
  assert.equal(menu.components.length, 1);
  assert.equal(menu.components[0].toJSON().components[0].custom_id, 'help-category-select');
  assert.doesNotMatch(JSON.stringify(menu), /open source|Report Bug|Support Server/);
});

test('music cards retain track details and pagination', () => {
  const track = { info: { title: 'Song', author: 'Artist', length: 120000, artworkUrl: 'https://example.com/cover.png' } };
  const playing = buildNowPlayingEmbed(track, { position: 30000, queue: [] }, {}).toJSON();
  assert.equal(playing.color, 0xD4AF37);
  assert.equal(playing.thumbnail.url, track.info.artworkUrl);
  assert.equal(playing.fields.find(f => f.name === 'Progress').value, '0:30 / 2:00');
  const queue = buildQueueEmbed([track], track, 0).toJSON();
  assert.equal(queue.color, 0xD4AF37);
  assert.match(queue.description, /Song/);
});

test('direct builders normalize old colors and preserve footer metadata when cloned', () => {
  const original = new EmbedBuilder().setTitle('Ticket').setColor(0x5865F2)
    .setFooter({ text: 'Ticket ID: 123', iconURL: 'https://example.com/icon.png' });
  const copy = EmbedBuilder.from(original);
  assert.equal(copy.toJSON().color, 0xD4AF37);
  assert.deepEqual(copy.toJSON(), original.toJSON());
  assert.equal(copy.toJSON().footer.text, 'AimReboot • Ticket ID: 123');
  assert.equal(new EmbedBuilder().setColor('primary').toJSON().color, 0xD4AF37);
  assert.equal(new EmbedBuilder().setColor('#123456').toJSON().color, 0x123456);
  assert.equal(new EmbedBuilder().setExactColor('#3498DB').toJSON().color, 0x3498DB);
  assert.equal(EmbedBuilder.from(new EmbedBuilder().setExactColor('#3498DB')).toJSON().color, 0x3498DB);
  assert.equal(new EmbedBuilder().setColor('#000000').toJSON().color, 0);
});

test('footer limits and native clear operations remain usable', () => {
  const embed = new EmbedBuilder().setTitle('Notice').setFooter({ text: 'x'.repeat(2048) });
  assert.equal(embed.toJSON().footer.text.length, 2048);
  embed.setFooter(null).setColor(null);
  assert.equal(embed.toJSON().footer, undefined);
  assert.equal(embed.toJSON().color, undefined);
  const blank = createEmbed({ title: 'Black', color: '#000000' });
  assert.equal(blank.toJSON().color, 0);
});

test('branding fits within the total Discord embed character limit', () => {
  const embed = new EmbedBuilder().setTitle('T'.repeat(256)).setDescription('D'.repeat(4096))
    .addFields({ name: 'N'.repeat(256), value: 'V'.repeat(1024) })
    .setFooter({ text: 'F'.repeat(368) });
  const data = embed.toJSON();
  const size = data.title.length + data.description.length + data.fields[0].name.length
    + data.fields[0].value.length + (data.footer?.text.length || 0);
  assert(size <= 6000);
});

test('moderation logs retain audit fields, icons, and timestamps', () => {
  const log = buildStandardLogEmbed({ color: 0x5865F2, title: 'Role updated',
    fields: [{ name: 'Role ID', value: '123456789012345678' }],
    footer: { text: 'Moderator', iconURL: 'https://example.com/mod.png' },
  }).toJSON();
  assert.equal(log.color, 0xD4AF37);
  assert.equal(log.fields[0].name, 'Role ID');
  assert.equal(log.footer.icon_url, 'https://example.com/mod.png');
  assert(log.timestamp);
});

async function listJs(directory) {
  const results = await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listJs(target) : entry.name.endsWith('.js') ? [target] : [];
  }));
  return results.flat();
}

test('all command modules import and built-in builders use the shared theme', async () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const allowedNative = new Set(['utils/themedEmbed.js', 'events/guildMemberAdd.js',
    'events/guildMemberRemove.js', 'commands/Tools/embedbuilder.js']);
  let commands = 0;
  for (const file of await listJs(src)) {
    const relative = path.relative(src, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    if (/import\s*\{[^}]*\bEmbedBuilder\b[^}]*\}\s*from\s*['"]discord\.js['"]/s.test(source)) {
      assert(allowedNative.has(relative), `Unstyled builder in ${relative}`);
    }
    if (relative.startsWith('commands/')) {
      await import(new URL(`../src/${relative}`, import.meta.url));
      commands++;
    }
  }
  assert(commands > 90);
});

test('every help category and command-list page serializes with working controls', async () => {
  const client = { user: { username: 'AimReboot' } };
  const initial = await createInitialHelpMenu(client);
  const options = initial.components[0].toJSON().components[0].options;
  for (const option of options) {
    let payload;
    await helpCategorySelectMenu.execute({ deferred: true, values: [option.value],
      editReply: async data => { payload = data; } }, client);
    assert(payload, `No help payload for ${option.value}`);
    for (const embed of payload.embeds) assert.equal(embed.toJSON().color, 0xD4AF37);
    assert(payload.components.flatMap(row => row.toJSON().components)
      .some(component => component.custom_id === 'help-back-to-main'));
    const rendered = renderMessage(payload);
    assert.equal(readMessageEmbeds(rendered.body)[0].title, payload.embeds[0].toJSON().title);
    assert(getActionRows(rendered.body.components).flatMap(row => row.components)
      .some(component => component.custom_id === 'help-back-to-main'));
    assert([...walkComponents(rendered.body.components)].length <= 40);
  }
  const first = await createAllCommandsMenu(1, client);
  assert(first.totalPages > 1);
  for (let page = 1; page <= first.totalPages; page++) {
    const menu = await createAllCommandsMenu(page, client);
    menu.embeds.forEach(embed => embed.toJSON());
    const buttons = menu.components.flatMap(row => row.toJSON().components);
    assert.equal(buttons.find(b => b.custom_id === 'help-page_prev').disabled, page === 1);
    assert.equal(buttons.find(b => b.custom_id === 'help-page_next').disabled, page === first.totalPages);
    const rendered = renderMessage(menu);
    assert.equal(rendered.files.length, 0, `Help page ${page} should fit without an overflow file`);
  }
  const second = renderMessage(await createAllCommandsMenu(2, client)).body;
  let changed;
  await helpPaginationButton.execute({ customId: 'help-page_prev', deferred: true, message: second,
    editReply: async payload => { changed = renderMessage(payload).body; } }, client);
  assert.equal(getActionRows(changed.components).flatMap(row => row.components)
    .find(button => button.custom_id === 'help-page_prev').disabled, true);
});
