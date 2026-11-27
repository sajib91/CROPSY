const { randomUUID } = require('node:crypto');


class InProcessNotificationQueue {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.handler = null;
    this.pending = new Set();
    this.timers = new Map();
  }

  setHandler(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('A queue handler is required.');
    }

    this.handler = handler;
  }

  async enqueue(payload, { delayMs = 0 } = {}) {
    if (!this.handler) {
      throw new Error('Notification queue handler is not configured.');
    }

    const job = {
      id: payload.jobId || randomUUID(),
      data: payload,
    };

    this.pending.add(job.id);

    const timer = setTimeout(async () => {
      this.pending.delete(job.id);
      this.timers.delete(job.id);

      try {
        await this.handler(job);
      } catch (error) {
        this.logger?.error(
          { err: error, jobId: job.id },
          'Notification job failed',
        );
      }
    }, Math.max(0, Number(delayMs) || 0));

    this.timers.set(job.id, timer);

    // Do not unref this timer.
    // Pending notification jobs must keep the event loop alive.
    return job.id;
  }

  async close() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.pending.clear();
  }
}


class BullMqNotificationQueue {
  constructor({ env, logger, queueName = 'cropsy-notifications' }) {
    let bullmq;
    try {
      bullmq = require('bullmq');
    } catch {
      throw new Error('NOTIFICATION_QUEUE_DRIVER=bullmq requires the bullmq package.');
    }
    const connection = { url: env.REDIS_URL };
    this.logger = logger;
    this.queue = new bullmq.Queue(queueName, { connection });
    this.worker = new bullmq.Worker(
      queueName,
      async (job) => {
        if (!this.handler) throw new Error('Notification worker handler is not configured.');
        await this.handler(job);
      },
      { connection, autorun: true },
    );
    this.worker.on('failed', (job, error) => {
      this.logger?.error(
        { err: error, jobId: job?.id },
        'BullMQ notification job exhausted retries',
      );
    });
  }

  setHandler(handler) {
    if (typeof handler !== 'function') throw new TypeError('A queue handler is required.');
    this.handler = handler;
  }

  async enqueue(payload, { delayMs = 0 } = {}) {
    const job = await this.queue.add('deliver', payload, {
      jobId: payload.jobId,
      // Delivery retries are owned by NotificationsService so every driver
      // applies the same policy and writes the same delivery-attempt log.
      attempts: 1,
      backoff: { type: 'exponential', delay: payload.retryDelayMs || 1000 },
      delay: delayMs,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return job.id;
  }

  async close() {
    await this.worker?.close();
    await this.queue?.close();
  }
}

function createNotificationQueue({ env, logger }) {
  return env.NOTIFICATION_QUEUE_DRIVER === 'bullmq'
    ? new BullMqNotificationQueue({ env, logger })
    : new InProcessNotificationQueue({ logger });
}

module.exports = {
  InProcessNotificationQueue,
  BullMqNotificationQueue,
  createNotificationQueue,
};
