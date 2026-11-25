'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PersistentDealQueue, backoffDelayMs } = require('../persistentDealQueue');

function makeQueue(overrides = {}) {
  const calls = [];
  const dealDoc = { _id: 'deal-1', status: 'processing', leaseOwner: 'worker-a', publisherToken: 1, leaseUntil: new Date('2026-11-24T12:01:00.000Z'), attempts: 1, payload: { text: 'Oferta de teste' } };
  const deals = {
    createIndex: async (...args) => calls.push(['dealIndex', ...args]),
    updateOne: async (...args) => { calls.push(['dealUpdate', ...args]); return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }; },
    updateMany: async (...args) => { calls.push(['dealUpdateMany', ...args]); return { modifiedCount: 2 }; },
    findOne: async () => dealDoc,
    findOneAndUpdate: async (...args) => { calls.push(['dealFindOneAndUpdate', ...args]); return dealDoc; }
  };
  const locks = {
    createIndex: async (...args) => calls.push(['lockIndex', ...args]),
    findOne: async (...args) => { calls.push(['lockFindOne', ...args]); return { _id: 'whatsapp-publisher', owner: 'worker-a', fencingToken: 1, leaseUntil: new Date('2026-11-24T12:01:00.000Z') }; },
    findOneAndUpdate: async (...args) => { calls.push(['lockFindOneAndUpdate', ...args]); return { _id: 'whatsapp-publisher', owner: 'worker-a', fencingToken: 1 }; },
    updateOne: async (...args) => { calls.push(['lockUpdate', ...args]); return { matchedCount: 1, modifiedCount: 1 }; }
  };
  const queue = new PersistentDealQueue({
    deals, locks, owner: 'worker-a',
    clock: () => new Date('2026-11-24T12:00:00.000Z'),
    random: () => 0.5,
    ...overrides
  });
  return { queue, calls, dealDoc };
}

test('enqueue uses deterministic identity and insert-only fields for deduplication', async () => {
  const { queue, calls } = makeQueue();
  const result = await queue.enqueue({ dedupeKey: 'awin:product-123', payload: { text: 'Oferta' }, source: 'awin' });
  assert.equal(result._id, 'deal-1');
  const update = calls.find(c => c[0] === 'dealUpdate');
  assert.match(update[1]._id, /^[a-f0-9]{64}$/);
  assert.ok(update[2].$setOnInsert);
  assert.equal(update[3].upsert, true);
});

test('claim checks the current publisher lease before atomically claiming a due item', async () => {
  const { queue, calls } = makeQueue();
  await queue.acquireLeadership();
  await queue.claimNext();
  const leaseCheck = calls.find(c => c[0] === 'lockFindOne');
  assert.equal(leaseCheck[1]._id, 'whatsapp-publisher');
  assert.equal(leaseCheck[1].owner, 'worker-a');
  const call = calls.find(c => c[0] === 'dealFindOneAndUpdate');
  assert.deepEqual(call[1], { status: 'pending', nextAttemptAt: { $lte: new Date('2026-11-24T12:00:00.000Z') } });
  assert.equal(call[2].$set.status, 'processing');
  assert.equal(call[2].$set.leaseOwner, 'worker-a');
  assert.equal(call[2].$set.publisherToken, 1);
  assert.equal(call[2].$inc.attempts, 1);
});

test('leadership lease is scoped to one publisher identity', async () => {
  const { queue, calls } = makeQueue();
  assert.equal(await queue.acquireLeadership(), true);
  const call = calls.find(c => c[0] === 'lockFindOneAndUpdate');
  assert.equal(call[1]._id, 'whatsapp-publisher');
  assert.ok(call[1].$or.some(x => x.owner === 'worker-a'));
  assert.equal(await queue.renewLeadership(), true);
  assert.equal(await queue.releaseLeadership(), true);
});

test('expired processing records are quarantined as uncertain, not requeued', async () => {
  const { queue, calls } = makeQueue();
  assert.equal(await queue.quarantineExpiredProcessing(), 2);
  const call = calls.find(c => c[0] === 'dealUpdateMany');
  assert.equal(call[1].status, 'processing');
  assert.equal(call[2].$set.status, 'uncertain');
  assert.equal(call[2].$unset.leaseOwner, '');
});

test('markSent requires ownership of the processing lease', async () => {
  const { queue, calls } = makeQueue();
  await queue.acquireLeadership();
  assert.equal(await queue.markSent('deal-1', { messageId: 'wa-msg-1' }), true);
  const call = calls.find(c => c[0] === 'dealUpdate');
  assert.deepEqual(call[1], { _id: 'deal-1', status: 'processing', leaseOwner: 'worker-a', publisherToken: 1, leaseUntil: { $gt: new Date('2026-11-24T12:00:00.000Z') } });
  assert.equal(call[2].$set.status, 'sent');
  assert.equal(call[2].$set.messageId, 'wa-msg-1');
});

test('retry backoff grows exponentially and is capped with jitter', () => {
  assert.equal(backoffDelayMs(1, { baseMs: 1000, maxMs: 10000, random: () => 0.5 }), 1000);
  assert.equal(backoffDelayMs(3, { baseMs: 1000, maxMs: 10000, random: () => 0.5 }), 4000);
  assert.equal(backoffDelayMs(10, { baseMs: 1000, maxMs: 5000, random: () => 0.5 }), 5000);
});

test('retry stops after configured maximum attempts', async () => {
  const { queue, calls, dealDoc } = makeQueue({ maxAttempts: 1 });
  await queue.acquireLeadership();
  dealDoc.attempts = 1;
  assert.equal(await queue.retry('deal-1', new Error('offline')), true);
  const call = calls.find(c => c[0] === 'dealUpdate');
  assert.equal(call[2].$set.status, 'failed');
  assert.equal(call[2].$set.lastError, 'offline');
});

test('deal lease renewal requires an unexpired lease owned by this worker', async () => {
  const { queue, calls } = makeQueue();
  await queue.acquireLeadership();
  assert.equal(await queue.renewDealLease('deal-1'), true);
  const call = calls.find(c => c[0] === 'dealUpdate');
  assert.deepEqual(call[1], { _id: 'deal-1', status: 'processing', leaseOwner: 'worker-a', publisherToken: 1, leaseUntil: { $gt: new Date('2026-11-24T12:00:00.000Z') } });
  assert.ok(call[2].$set.leaseUntil > new Date('2026-11-24T12:00:00.000Z'));
});

test('enqueue rejects oversized dedupe keys and unserializable payloads', async () => {
  const { queue } = makeQueue();
  await assert.rejects(queue.enqueue({ dedupeKey: 'x'.repeat(513), payload: { ok: true } }), /dedupeKey/);
  const circular = {}; circular.self = circular;
  await assert.rejects(queue.enqueue({ dedupeKey: 'valid-key', payload: circular }), /serializável/);
});

test('backoff rejects invalid retry parameters', () => {
  assert.throws(() => backoffDelayMs(0), /attempt/);
  assert.throws(() => backoffDelayMs(1, { baseMs: -1 }), /baseMs/);
  assert.throws(() => backoffDelayMs(1, { baseMs: 500, maxMs: 100 }), /maxMs/);
});

test('constructor rejects an empty publisher identity', () => {
  const { queue } = makeQueue();
  assert.throws(() => new PersistentDealQueue({ deals: queue.deals, locks: queue.locks, owner: '' }), /owner/);
});
