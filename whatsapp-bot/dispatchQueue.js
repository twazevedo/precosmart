'use strict';

const { randomUUID } = require('node:crypto');

const DEFAULTS = Object.freeze({
  maxAttempts: 5,
  leaseMs: 90_000,
  baseBackoffMs: 30_000,
  maxBackoffMs: 30 * 60_000
});

/**
 * Durable dispatch queue backed by a dedicated MongoDB collection.
 *
 * This module deliberately does not know about WhatsApp credentials, auth_info,
 * sockets, or the existing offer catalog. It only stores dispatch jobs.
 */
class PersistentDispatchQueue {
  constructor(collection, options = {}) {
    if (!collection) throw new TypeError('MongoDB collection is required');
    this.collection = collection;
    this.options = { ...DEFAULTS, ...options };
    this.now = options.now || (() => new Date());
    this.createId = options.createId || randomUUID;
  }

  async ensureIndexes() {
    await this.collection.createIndex(
      { idempotencyKey: 1 },
      {
        name: 'dispatch_idempotency_unique',
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: 'string' } }
      }
    );
    await this.collection.createIndex(
      { status: 1, availableAt: 1, priority: -1, createdAt: 1 },
      { name: 'dispatch_pending_order' }
    );
    await this.collection.createIndex(
      { status: 1, lockedUntil: 1 },
      { name: 'dispatch_expired_leases' }
    );
  }

  async enqueue({ payload, targets, idempotencyKey, priority = 0, maxAttempts } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('payload must be an object');
    }
    if (!Array.isArray(targets) || targets.length === 0 ||
        targets.some((target) => typeof target !== 'string' || !target.trim())) {
      throw new TypeError('targets must contain at least one non-empty destination');
    }
    if (idempotencyKey !== undefined &&
        (typeof idempotencyKey !== 'string' || !idempotencyKey.trim())) {
      throw new TypeError('idempotencyKey must be a non-empty string');
    }

    const now = this.now();
    const job = {
      _id: this.createId(),
      ...(idempotencyKey ? { idempotencyKey: idempotencyKey.trim() } : {}),
      payload,
      targets: [...new Set(targets.map((target) => target.trim()))],
      priority: Number.isFinite(priority) ? priority : 0,
      status: 'pending',
      attempts: 0,
      maxAttempts: Number.isInteger(maxAttempts) && maxAttempts > 0
        ? maxAttempts : this.options.maxAttempts,
      availableAt: now,
      createdAt: now,
      updatedAt: now
    };

    try {
      await this.collection.insertOne(job);
      return { job, inserted: true };
    } catch (error) {
      if (error?.code !== 11000 || !job.idempotencyKey) throw error;
      const existing = await this.collection.findOne({ idempotencyKey: job.idempotencyKey });
      if (!existing) throw error;
      return { job: existing, inserted: false };
    }
  }

  async claimNext(workerId, options = {}) {
    if (typeof workerId !== 'string' || !workerId.trim()) {
      throw new TypeError('workerId is required');
    }
    const now = this.now();
    const leaseMs = Number.isInteger(options.leaseMs) && options.leaseMs > 0
      ? options.leaseMs : this.options.leaseMs;
    const leaseToken = this.createId();

    const result = await this.collection.findOneAndUpdate(
      {
        $or: [
          { status: 'pending', availableAt: { $lte: now } },
          { status: 'processing', lockedUntil: { $lte: now } }
        ]
      },
      {
        $set: {
          status: 'processing',
          workerId,
          leaseToken,
          lockedUntil: new Date(now.getTime() + leaseMs),
          startedAt: now,
          updatedAt: now
        },
        $inc: { attempts: 1 }
      },
      {
        sort: { priority: -1, availableAt: 1, createdAt: 1 },
        returnDocument: 'after'
      }
    );

    // MongoDB Node driver v6+ returns the document directly. The wrapper
    // fallback also supports older driver versions returning ModifyResult.
    return result && Object.prototype.hasOwnProperty.call(result, 'value')
      ? result.value : result;
  }

  async markSent(job, results = []) {
    if (!job?._id || !job.leaseToken) throw new TypeError('A claimed job is required');
    const now = this.now();
    const result = await this.collection.updateOne(
      { _id: job._id, status: 'processing', leaseToken: job.leaseToken },
      {
        $set: { status: 'sent', results, sentAt: now, updatedAt: now },
        $unset: { workerId: '', leaseToken: '', lockedUntil: '', lastError: '' }
      }
    );
    return result.modifiedCount === 1;
  }

  async retryOrFail(job, error, options = {}) {
    if (!job?._id || !job.leaseToken) throw new TypeError('A claimed job is required');
    const now = this.now();
    const maxAttempts = job.maxAttempts || this.options.maxAttempts;
    const exhausted = job.attempts >= maxAttempts;
    const base = this.options.baseBackoffMs;
    const cap = this.options.maxBackoffMs;
    const delay = Math.min(cap, base * (2 ** Math.max(0, job.attempts - 1)));
    const nextStatus = exhausted || options.permanent ? 'failed' : 'pending';
    const update = {
      $set: {
        status: nextStatus,
        updatedAt: now,
        lastError: String(error?.message || error || 'Unknown dispatch error').slice(0, 2000),
        ...(nextStatus === 'pending' ? { availableAt: new Date(now.getTime() + delay) } : {}),
        ...(nextStatus === 'failed' ? { failedAt: now } : {})
      },
      $unset: { workerId: '', leaseToken: '', lockedUntil: '' }
    };
    const result = await this.collection.updateOne(
      { _id: job._id, status: 'processing', leaseToken: job.leaseToken },
      update
    );
    return result.modifiedCount === 1
      ? { updated: true, status: nextStatus, retryInMs: nextStatus === 'pending' ? delay : 0 }
      : { updated: false, status: null, retryInMs: 0 };
  }


  async markUncertain(job, error) {
    if (!job?._id || !job.leaseToken) throw new TypeError('A claimed job is required');
    const now = this.now();
    const result = await this.collection.updateOne(
      { _id: job._id, status: 'processing', leaseToken: job.leaseToken },
      {
        $set: {
          status: 'uncertain',
          updatedAt: now,
          uncertainAt: now,
          lastError: String(error?.message || error || 'Ambiguous WhatsApp send result').slice(0, 2000)
        },
        $unset: { workerId: '', leaseToken: '', lockedUntil: '' }
      }
    );
    return result.modifiedCount === 1;
  }

  async getStats() {
    const statuses = ['pending', 'processing', 'sent', 'failed', 'uncertain'];
    const entries = await Promise.all(statuses.map(async (status) => [
      status, await this.collection.countDocuments({ status })
    ]));
    return Object.fromEntries(entries);
  }
}

module.exports = { PersistentDispatchQueue, DEFAULTS };
