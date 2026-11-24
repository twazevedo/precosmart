'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PersistentDealQueue, backoffDelayMs } = require('../persistentDealQueue');

function makeQueue(overrides = {}) {
  const calls = [];
  const dealDoc = {
    _id: 'deal-1',
    status: 'processing',
    leaseOwner: 'worker-a',
    attempts: 1,
    payload: { text: 'Oferta de teste' }
  };
  const deals = {
    createIndex: async (...args) => calls.push(['dealIndex', ...args]),
    updateOne: async (...args) => { calls.push(['dealUpdate', ...args]); return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }; },
    updateMany: async (...args) => { calls.push(['dealUpdateMany', ...args]); return { modifiedCount: 2 }; },
    findOne: async () => dealDoc,
    findOneAndUpdate: async (...args) => { calls.push(['dealFindOneAndUpdate', ...args]); return dealDoc; }
  };
  const locks = {
    createIndex: async (...args) => calls.push(['lockIndex', ...args]),
    findOneAndUpdate: async (...args) => { calls.push(['lockFindOneAndUpdate', ...args]); return { _id: 'whatsapp-publisher', owner: 'worker-a' }; },
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

test('enqueue uses a deterministic id and insert-only fields for deduplication', async () => {
  const { queue, calls } = makeQueue();
  const result = await queue.enqueue({ dedupeKey: 'awin:product-123', payload: { text: 'Oferta' }, source: 'awin' });
  assert.equal(result._id, 'deal-1');
  const update = calls.find(c => c[0] === 'dealUpdate');
  assert.equal(update[1]._id, 'deal-1');
  assert.ok(update[2].$setOnInsert);
  assert.equal(update[3].upsert, true);
});

test('claim only atomically selects due pending items and records a lease', async () => {
  const { queue, calls } = makeQueue();
  await queue.claimNext();
  const call = calls.find(c => c[0] === 'dealFindOneAndUpdate');
  assert.deepEqual(call[1], {
    status: 'pending',
    nextAttemptAt: { $lte: new Date('2026-11-24T12:00:00.000Z') }
  });
  assert.equal(call[2].$set.status, 'processing');
  assert.equal(call[2].$set.leaseOwner, 'worker-a');
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
  assert.equal(await queue.markSent('deal-1', { messageId: 'wa-msg-1' }), true);
  const call = calls.find(c => c[0] === 'dealUpdate');
  assert.deepEqual(call[1], { _id: 'deal-1', status: 'processing', leaseOwner: 'worker-a' });
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
  dealDoc.attempts = 1;
  assert.equal(await queue.retry('deal-1', new Error('offline')), true);
  const call = calls.find(c => c[0] === 'dealUpdate');
  assert.equal(call[2].$set.status, 'failed');
  assert.equal(call[2].$set.lastError, 'offline');
});
