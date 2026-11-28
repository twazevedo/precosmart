'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PersistentDispatchQueue } = require('../dispatchQueue');

class FakeCollection {
  constructor() { this.docs = []; this.indexes = []; }
  async createIndex(keys, options) { this.indexes.push({ keys, options }); }
  async insertOne(doc) {
    if (doc.idempotencyKey && this.docs.some((d) => d.idempotencyKey === doc.idempotencyKey)) {
      const error = new Error('duplicate key'); error.code = 11000; throw error;
    }
    this.docs.push(structuredClone(doc));
    return { insertedId: doc._id };
  }
  async findOne(query) { return structuredClone(this.docs.find((d) => d.idempotencyKey === query.idempotencyKey) || null); }
  async findOneAndUpdate(query, update, options) {
    const now = query.$or[0].status === 'pending'
      ? query.$or[0].availableAt.$lte : query.$or[1].lockedUntil.$lte;
    const eligible = this.docs.filter((d) =>
      (d.status === 'pending' && d.availableAt <= query.$or[0].availableAt.$lte) ||
      (d.status === 'processing' && d.lockedUntil <= query.$or[1].lockedUntil.$lte)
    ).sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    const doc = eligible[0];
    if (!doc) return null;
    Object.assign(doc, structuredClone(update.$set));
    for (const [key, amount] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + amount;
    return structuredClone(doc);
  }
  async updateOne(filter, update) {
    const doc = this.docs.find((d) => d._id === filter._id &&
      d.status === filter.status && d.leaseToken === filter.leaseToken);
    if (!doc) return { modifiedCount: 0 };
    Object.assign(doc, structuredClone(update.$set || {}));
    for (const key of Object.keys(update.$unset || {})) delete doc[key];
    return { modifiedCount: 1 };
  }
  async countDocuments(query) { return this.docs.filter((d) => d.status === query.status).length; }
}

function setup() {
  let clock = new Date('2026-01-01T12:00:00.000Z');
  let id = 0;
  const collection = new FakeCollection();
  const queue = new PersistentDispatchQueue(collection, {
    now: () => new Date(clock),
    createId: () => `id-${++id}`,
    baseBackoffMs: 1000,
    maxBackoffMs: 4000,
    leaseMs: 5000
  });
  return { queue, collection, advance: (ms) => { clock = new Date(clock.getTime() + ms); } };
}

test('creates indexes for idempotency, pending order and expired leases', async () => {
  const { queue, collection } = setup();
  await queue.ensureIndexes();
  assert.equal(collection.indexes.length, 3);
  assert.equal(collection.indexes[0].options.unique, true);
});

test('validates payload and destinations', async () => {
  const { queue } = setup();
  await assert.rejects(() => queue.enqueue({ payload: {}, targets: [] }), /targets/);
  await assert.rejects(() => queue.enqueue({ payload: null, targets: ['group@g.us'] }), /payload/);
});

test('deduplicates enqueue by idempotency key', async () => {
  const { queue, collection } = setup();
  const input = { payload: { text: 'Oferta' }, targets: ['group@g.us'], idempotencyKey: 'offer-1' };
  const first = await queue.enqueue(input);
  const second = await queue.enqueue(input);
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
  assert.equal(collection.docs.length, 1);
});

test('claims highest-priority pending job and increments attempts', async () => {
  const { queue } = setup();
  await queue.enqueue({ payload: { text: 'normal' }, targets: ['g@g.us'], priority: 1 });
  await queue.enqueue({ payload: { text: 'urgent' }, targets: ['g@g.us'], priority: 10 });
  const claimed = await queue.claimNext('worker-a');
  assert.equal(claimed.payload.text, 'urgent');
  assert.equal(claimed.status, 'processing');
  assert.equal(claimed.attempts, 1);
  assert.ok(claimed.leaseToken);
});

test('returns a claimed job to pending with exponential backoff', async () => {
  const { queue, advance } = setup();
  await queue.enqueue({ payload: { text: 'retry me' }, targets: ['g@g.us'] });
  const claimed = await queue.claimNext('worker-a');
  const result = await queue.retryOrFail(claimed, new Error('temporary'));
  assert.deepEqual(result, { updated: true, status: 'pending', retryInMs: 1000 });
  assert.equal(await queue.claimNext('worker-a'), null);
  advance(1000);
  assert.equal((await queue.claimNext('worker-a')).attempts, 2);
});

test('moves exhausted jobs to failed instead of retrying forever', async () => {
  const { queue, advance } = setup();
  await queue.enqueue({ payload: { text: 'exhaust me' }, targets: ['g@g.us'], maxAttempts: 2 });
  let claimed = await queue.claimNext('worker-a');
  await queue.retryOrFail(claimed, 'temporary');
  advance(1000);
  claimed = await queue.claimNext('worker-a');
  const result = await queue.retryOrFail(claimed, 'still broken');
  assert.equal(result.status, 'failed');
});

test('marks sent only when the active lease token matches', async () => {
  const { queue } = setup();
  await queue.enqueue({ payload: { text: 'sent' }, targets: ['g@g.us'] });
  const claimed = await queue.claimNext('worker-a');
  assert.equal(await queue.markSent({ ...claimed, leaseToken: 'stale-token' }), false);
  assert.equal(await queue.markSent(claimed, [{ target: 'g@g.us', ok: true }]), true);
  assert.deepEqual(await queue.getStats(), { pending: 0, processing: 0, sent: 1, failed: 0 });
});
