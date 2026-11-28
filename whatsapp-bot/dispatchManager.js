'use strict';

/**
 * Single-process worker for the durable WhatsApp dispatch queue.
 * MongoDB leases remain the cross-process concurrency guard.
 *
 * Each job contains exactly one target. A rejected sendMessage promise is
 * marked "uncertain", not retried automatically, because the remote outcome
 * may be ambiguous and a retry could publish a duplicate.
 */
class DispatchManager {
  constructor({
    queue,
    getSocket,
    isEnabled = () => true,
    logger = () => {},
    workerId = `precosmart-${process.pid}`,
    pollIntervalMs = 5000,
    leaseMs = 90000
  } = {}) {
    if (!queue) throw new TypeError('queue is required');
    if (typeof getSocket !== 'function') throw new TypeError('getSocket is required');
    this.queue = queue;
    this.getSocket = getSocket;
    this.isEnabled = isEnabled;
    this.logger = logger;
    this.workerId = workerId;
    this.pollIntervalMs = pollIntervalMs;
    this.leaseMs = leaseMs;
    this.timer = null;
    this.running = false;
    this.stopped = true;
  }

  async enqueue({ message, target, idempotencyKey, priority = 0 } = {}) {
    if (!target || !String(target).endsWith('@g.us')) {
      throw new TypeError('Only WhatsApp group destinations are allowed');
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new TypeError('message must be a WhatsApp message object');
    }
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new TypeError('idempotencyKey is required');
    }

    const result = await this.queue.enqueue({
      payload: { message },
      targets: [target],
      idempotencyKey: `${idempotencyKey}:${target}`,
      priority
    });
    this.wake();
    return result;
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => this.wake(), this.pollIntervalMs);
    this.timer.unref?.();
    this.wake();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  wake() {
    if (this.stopped || this.running) return;
    this.drain().catch((error) => this.logger('ERROR', `Dispatch worker: ${error.message}`));
  }

  async drain() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      while (!this.stopped && this.isEnabled()) {
        const socket = this.getSocket();
        if (!socket || typeof socket.sendMessage !== 'function') return;

        const job = await this.queue.claimNext(this.workerId, { leaseMs: this.leaseMs });
        if (!job) return;

        const target = job.targets?.[0];
        const message = job.payload?.message;
        if (!target || !target.endsWith('@g.us') || !message) {
          await this.queue.retryOrFail(job, 'Invalid persisted dispatch payload', { permanent: true });
          this.logger('ERROR', `Invalid dispatch job ${job._id}`);
          continue;
        }

        try {
          const result = await socket.sendMessage(target, message);
          await this.queue.markSent(job, [{
            target,
            messageId: result?.key?.id || null,
            submittedAt: new Date()
          }]);
          this.logger('DISPATCH_SENT', `Message submitted to WhatsApp socket for ${target}`);
        } catch (error) {
          await this.queue.markUncertain(job, error);
          this.logger('WARN', `Dispatch outcome uncertain for ${target}; automatic retry blocked: ${error.message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

module.exports = { DispatchManager };
