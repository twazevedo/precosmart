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
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt deve ser um inteiro positivo.');
  if (!Number.isFinite(baseMs) || baseMs < 0) throw new RangeError('baseMs deve ser um número finito não negativo.');
  if (!Number.isFinite(maxMs) || maxMs < baseMs) throw new RangeError('maxMs deve ser finito e maior ou igual a baseMs.');
  if (typeof random !== 'function') throw new TypeError('random deve ser uma função.');
  const exponent = Math.max(0, Math.min(20, Number(attempt || 1) - 1));
  const ceiling = Math.min(maxMs, baseMs * (2 ** exponent));
  return Math.floor(ceiling * (0.8 + (random() * 0.4)));
}

class PersistentDealQueue {
  constructor({ deals, locks, owner = crypto.randomUUID(), leaseMs = 45_000, maxAttempts = 5, clock = () => new Date(), random = Math.random }) {
    if (!deals || !locks) throw new TypeError('Coleções MongoDB deals e locks são obrigatórias.');
    this.deals = deals;
    this.locks = locks;
    if (typeof owner !== 'string' || !owner.trim()) throw new TypeError('owner deve ser uma identidade não vazia.');
    this.owner = owner;
    this.fencingToken = null;
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
    this.random = random;
    if (!Number.isFinite(leaseMs) || leaseMs < 5000) throw new RangeError('leaseMs deve ser de pelo menos 5000 ms.');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('maxAttempts deve ser um inteiro positivo.');
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
    if (typeof dedupeKey !== 'string' || !dedupeKey.trim() || dedupeKey.length > 512) throw new TypeError('dedupeKey deve conter de 1 a 512 caracteres.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('payload deve ser um objeto.');
    let serialized;
    try { serialized = JSON.stringify(payload); } catch { throw new TypeError('payload precisa ser serializável em JSON.'); }
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > 256 * 1024) throw new RangeError('payload excede o limite de 256 KiB.');
    dedupeKey = dedupeKey.trim();
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
        { $set: { owner: this.owner, leaseUntil, updatedAt: now }, $inc: { fencingToken: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      const lock = unwrapFindOneAndUpdate(result);
      if (!lock || lock.owner !== this.owner || !Number.isInteger(lock.fencingToken)) return false;
      this.fencingToken = lock.fencingToken;
      return true;
    } catch (error) {
      // Concurrent upserts can race on the fixed _id. A duplicate means another
      // publisher owns the lease; it is not a reason to crash the bot process.
      if (error && error.code === 11000) return false;
      throw error;
    }
  }

  async hasLeadership() {
    const now = this.clock();
    const lock = await this.locks.findOne({ _id: 'whatsapp-publisher', owner: this.owner, fencingToken: this.fencingToken, leaseUntil: { $gt: now } });
    return !!lock;
  }

  async renewLeadership() {
    const now = this.clock();
    const result = await this.locks.updateOne(
      { _id: 'whatsapp-publisher', owner: this.owner, fencingToken: this.fencingToken, leaseUntil: { $gt: now } },
      { $set: { leaseUntil: new Date(now.getTime() + this.leaseMs), updatedAt: now } }
    );
    return result.modifiedCount === 1 || result.matchedCount === 1;
  }

  async releaseLeadership() {
    const result = await this.locks.updateOne(
      { _id: 'whatsapp-publisher', owner: this.owner, fencingToken: this.fencingToken },
      { $set: { leaseUntil: new Date(0), updatedAt: this.clock() }, $unset: { owner: '' } }
    );
    const released = result.modifiedCount === 1 || result.matchedCount === 1;
    if (released) this.fencingToken = null;
    return released;
  }

  async claimNext() {
    // The distributed lease is checked before each claim, not just at startup.
    if (!(await this.hasLeadership())) return null;
    const now = this.clock();
    const fencingToken = this.fencingToken;
    const result = await this.deals.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { status: 'processing', leaseOwner: this.owner, publisherToken: fencingToken, leaseUntil: new Date(now.getTime() + this.leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' }
    );
    const claimed = unwrapFindOneAndUpdate(result);
    if (!claimed) return null;
    // Recheck after claim: if leadership changed during the cross-collection
    // window, release only this worker's claim and do not hand it to a sender.
    if (!(await this.hasLeadership())) {
      await this.deals.updateOne(
        { _id: claimed._id, status: 'processing', leaseOwner: this.owner, publisherToken: fencingToken, leaseUntil: { $gt: this.clock() } },
        { $set: { status: 'pending', nextAttemptAt: this.clock(), updatedAt: this.clock() }, $unset: { leaseOwner: '', publisherToken: '', leaseUntil: '' } }
      );
      return null;
    }
    return claimed;
  }

  async renewDealLease(id) {
    const now = this.clock();
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner, publisherToken: this.fencingToken, leaseUntil: { $gt: now } },
      { $set: { leaseUntil: new Date(now.getTime() + this.leaseMs), updatedAt: now } }
    );
    return result.matchedCount === 1;
  }

  async markSent(id, { messageId = null } = {}) {
    const now = this.clock();
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner, leaseUntil: { $gt: now } },
      { $set: { status: 'sent', sentAt: now, messageId, updatedAt: now }, $unset: { leaseOwner: '', publisherToken: '', leaseUntil: '' } }
    );
    return result.modifiedCount === 1;
  }

  async retry(id, error, { baseMs, maxMs } = {}) {
    const current = await this.deals.findOne({ _id: id, status: 'processing', leaseOwner: this.owner, publisherToken: this.fencingToken, leaseUntil: { $gt: this.clock() } });
    if (!current) return false;
    const now = this.clock();
    const message = String(error && error.message ? error.message : error || 'Falha desconhecida').slice(0, 500);
    if (current.attempts >= this.maxAttempts) {
      const result = await this.deals.updateOne(
        { _id: id, status: 'processing', leaseOwner: this.owner, leaseUntil: { $gt: now } },
        { $set: { status: 'failed', lastError: message, updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
      );
      return result.modifiedCount === 1;
    }
    const delay = backoffDelayMs(current.attempts, { baseMs, maxMs, random: this.random });
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner, leaseUntil: { $gt: now } },
      { $set: { status: 'pending', lastError: message, nextAttemptAt: new Date(now.getTime() + delay), updatedAt: now }, $unset: { leaseOwner: '', leaseUntil: '' } }
    );
    return result.modifiedCount === 1;
  }

  async markUncertain(id, reason = 'Resultado do envio não confirmado') {
    const now = this.clock();
    const result = await this.deals.updateOne(
      { _id: id, status: 'processing', leaseOwner: this.owner, leaseUntil: { $gt: now } },
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
