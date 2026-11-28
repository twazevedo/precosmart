'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DispatchManager } = require('../dispatchManager');

function createQueue(job) {
  const calls = [];
  return {
    calls,
    async enqueue(input) { calls.push(['enqueue', input]); return { job: input, inserted: true }; },
    async claimNext() { return job || null; },
    async markSent(...args) { calls.push(['sent', ...args]); return true; },
    async markUncertain(...args) { calls.push(['uncertain', ...args]); return true; },
    async retryOrFail(...args) { calls.push(['retry', ...args]); return { updated: true }; }
  };
}

test('enqueue creates one idempotent job per group destination', async () => {
  const queue = createQueue(null);
  const manager = new DispatchManager({ queue, getSocket: () => null });
  const result = await manager.enqueue({
    message: { text: 'Oferta' },
    target: '120363000000000000@g.us',
    idempotencyKey: 'offer-123'
  });
  assert.equal(result.inserted, true);
  assert.equal(queue.calls[0][1].targets.length, 1);
  assert.equal(queue.calls[0][1].idempotencyKey, 'offer-123:120363000000000000@g.us');
});

test('rejects non-group destinations', async () => {
  const manager = new DispatchManager({ queue: createQueue(null), getSocket: () => null });
  await assert.rejects(
    manager.enqueue({ message: { text: 'x' }, target: '5511999999999@s.whatsapp.net', idempotencyKey: 'x' }),
    /Only WhatsApp group/
  );
});

test('marks a successful socket submission as sent', async () => {
  const job = {
    _id: 'job-1', leaseToken: 'lease-1',
    targets: ['120363000000000000@g.us'],
    payload: { message: { text: 'Oferta' } }
  };
  const queue = createQueue(job);
  const socket = { async sendMessage() { return { key: { id: 'wamid-1' } }; } };
  const manager = new DispatchManager({ queue, getSocket: () => socket });
  await manager.drain();
  assert.equal(queue.calls.some(([kind]) => kind === 'sent'), true);
  assert.equal(queue.calls.some(([kind]) => kind === 'uncertain'), false);
});

test('does not automatically retry an ambiguous send failure', async () => {
  const job = {
    _id: 'job-2', leaseToken: 'lease-2',
    targets: ['120363000000000000@g.us'],
    payload: { message: { text: 'Oferta' } }
  };
  const queue = createQueue(job);
  const socket = { async sendMessage() { throw new Error('socket timeout'); } };
  const manager = new DispatchManager({ queue, getSocket: () => socket });
  await manager.drain();
  assert.equal(queue.calls.some(([kind]) => kind === 'uncertain'), true);
  assert.equal(queue.calls.some(([kind]) => kind === 'retry'), false);
});

test('does not claim jobs while paused', async () => {
  const queue = createQueue(null);
  let enabled = false;
  const manager = new DispatchManager({ queue, getSocket: () => ({ sendMessage: async () => ({}) }), isEnabled: () => enabled });
  await manager.drain();
  assert.equal(queue.calls.length, 0);
});
