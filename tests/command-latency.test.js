import test from 'node:test';
import assert from 'node:assert/strict';
import ping from '../src/commands/Core/ping.js';

test('/ping acknowledges then sends one final card without an intermediate edit', async () => {
  const calls = [];
  const interaction = {
    id: '123456789012345678', user: { id: '123456789012345679' },
    createdTimestamp: Date.now() - 150, client: { ws: { ping: 42 } },
    deferred: false, replied: false,
    async deferReply() { calls.push('defer'); this.deferred = true; },
    async editReply(payload) { calls.push(payload); this.replied = true; },
  };
  await ping.execute(interaction);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], 'defer');
  const card = calls[1].embeds[0].toJSON();
  assert.equal(card.title, 'Pong!');
  assert.equal(card.fields.find(field => field.name === 'API Latency').value, '42ms');
});
