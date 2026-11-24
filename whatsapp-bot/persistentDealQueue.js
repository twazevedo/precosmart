'use strict';

/**
 * MongoDB-backed queue primitives for the PreçoSmart WhatsApp publisher.
 * Not wired into bot.js until durable MongoDB and single-process deployment
 * are verified for the existing Render service.
 */
const crypto = require('node:crypto');

function unwrapFindOneAndUpdate(result) {
  return result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;
}

function backoffDelayMs(attempt, { baseMs = 5000, maxMs = 15 * 60 * 1000, random = Math.random } = {}) {
  const exponent = Math.max(0, Math.min(20, Number(attempt || 1) - 1));
  const ceiling = Math.min(maxMs, baseMs * (2 ** exponent));
  return Math.floor(ceiling * (0.8 + (random() * 0.4)));
}

class PersistentDealQueue {
  constructor({ deals, locks, owner = crypto.randomUUID(), leaseMs = 45_000, maxAttempts = 5, clock = () => new Date(), random = Math.random }) {
    if (!deals || !locks) throw new TypeError('Coleções MongoDB deals e locks são obrigatórias.');
    this.deals = deals;
    this.locks = locks;
    this.owner = owner;
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
    this.random = random;
  }

  async ensureIndexes() {
    await Promise.all([
      this.deals.createIndex({ dedupeKey: 1 }, { unique: true, name: 'uniq_deal_dedupe' }),
      this.deals.createIndex({ status: 1, nextAttemptAt: 1, createdAt: 1 }, { name: 'queue_pending_order' }),
      this.deals.createIndex({ status: 1, leaseUntil: 1 }, { name: 'queue_expired_leases' }),
      this.locks.createIndex({ leaseUntil: 1 }, { name: 'publisher_lease_expiry' })
    ]);
  }

  async enqueue({ dedupeKey, payload, source = 'unknown' }) {
    if (!dedupeKey || typeof dedupeKey !== 'string') throw new TypeError('dedupeKey é obrigatório.');
    if (!payload || typeof payload !== 'object') throw new TypeError('payload deve ser um objeto.');
    const now = this.clock();
    const _id = crypto.createHash('sha256').update(dedupeKey).digest('hex');
    await this.deals.updateOne(
      { _id },
      { $setOnInsert: { dedupeKey, payload, source, status: 'pending', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now } },
      { upsert: true }
    );
    return this.deals.findOne({ _id });
  }

  async acquireLeadership() {
    const now = this.clock();
    const leaseUntil = new Date(now.getTime() + this.leaseMs);
    try {
      const result = await this.locks.findOneAndUpdate(
        { _id: 'whatsapp-publisher', $or: [{ owner: this.owner }, { leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
        { $set: { owner: this.owner, leaseUntil, updatedAt: now } },
        { upsert: true, returnDocument: 'after' }
      );
      const lock = unwrapFindOneAndUpdate(result);
      return !!(lock && lock.owner === this.owner);
    } catch (error) {
      // Concurrent upserts can race on the fixed _id. A duplicate means another
      // publisher owns the lease; it is not a reason to crash the bot process.
      if (error && error.code === 11000) return false;
      throw error;
    }
  }

  async hasLeadership() {
    const now = this.clock();
    const lock = await this.locks.findOne({ _id: 'whatsapp-publisher', owner: this.owner, leaseUntil: { $gt: now } });
    return !!lock;
  }

  async renewLeadership() {
    const now = this.clock();
    const result = await this.locks.updateOne(
      { _id: 'whatsapp-publisher', owner: this.owner, leaseUntil: { $gt: now } },
      { $set: { leaseUntil: new Date(now.getTime() + this.leaseMs), updatedAt: now } }
    );
    return result.modifiedCount === 1 || result.matchedCount === 1;
  }

  async releaseLeadership() {
    const result = await this.locks.updateOne(
      { _id: 'whatsapp-publisher', owner: this.owner },
      { $set: { leaseUntil: new Date(0), updatedAt: this.clock() }, $unset: { owner: '' } }
    );
    return result.modifiedCount === 1 || result.matchedCount === 1;
  }

  async claimNext() {
    // The distributed lease is checked before each claim, not just at startup.
    if (!(await this.hasLeadership())) return null;
    const now = this.clock();
    const result = await this.deals.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { status: 'processing', leaseOwner: this.owner, leaseUntil: new Date(now.getTime() + this.leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' }
    );
    return unwrapFindOneAndUpdate(result);
  }

  async markSent(id, { messageId = null } = {}) {
    const now = this.clock();
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner },
      { $set: { status: 'sent', sentAt: now, messageId, updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
    );
    return result.modifiedCount === 1;
  }

  async retry(id, error, { baseMs, maxMs } = {}) {
    const current = await this.deals.findOne({ _id: id, status: 'processing', leaseOwner: this.owner });
    if (!current) return false;
    const now = this.clock();
    const message = String(error && error.message ? error.message : error || 'Falha desconhecida').slice(0, 500);
    if (current.attempts >= this.maxAttempts) {
      const result = await this.deals.updateOne(
        { _id: id, status: 'processing', leaseOwner: this.owner },
        { $set: { status: 'failed', lastError: message, updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
      );
      return result.modifiedCount === 1;
    }
    const delay = backoffDelayMs(current.attempts, { baseMs, maxMs, random: this.random });
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner },
      { $set: { status: 'pending', lastError: message, nextAttemptAt: new Date(now.getTime() + delay), updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
    );
    return result.modifiedCount === 1;
  }

  async markUncertain(id, reason = 'Resultado do envio não confirmado') {
    const now = this.clock();
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner },
      { $set: { status: 'uncertain', lastError: String(reason).slice(0, 500), updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
    );
    return result.modifiedCount === 1;
  }

  // A crash can occur after WhatsApp accepted a message but before success was
  // persisted. Expired processing records are quarantined, never auto-requeued.
  async quarantineExpiredProcessing() {
    const now = this.clock();
    const result = await this.deals.updateMany(
      { status: 'processing', leaseUntil: { $lte: now } },
      { $set: { status: 'uncertain', lastError: 'Lease expirado; verificar possível envio antes de reenviar', updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
    );
    return result.modifiedCount || 0;
  }
}

module.exports = { PersistentDealQueue, backoffDelayMs, unwrapFindOneAndUpdate };
