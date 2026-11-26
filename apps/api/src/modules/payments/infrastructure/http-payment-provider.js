const { createHmac, timingSafeEqual } = require('node:crypto');

const { NotImplementedError, UnauthorizedError } = require('../../../shared/kernel/errors');
const { assertProvider } = require('../domain/payment-provider');

/**
 * Generic, configuration-driven HTTP adapter. URLs and tokens come only from
 * deployment configuration; this repository contains no provider credentials
 * and makes no claim of a certified integration with any provider. Provider-
 * specific SDKs can be injected through PaymentProviderRegistryToken instead.
 */
class HttpPaymentProvider {
  constructor(config = {}) {
    if (!config.code) throw new TypeError('HttpPaymentProvider requires a provider code.');
    this.code = config.code;
    this.methods = [...(config.methods || [])];
    this.urls = {
      initiate: config.initiateUrl || null,
      verify: config.verifyUrl || null,
      refund: config.refundUrl || null,
    };
    this.authToken = config.authToken || null;
    this.webhookSecret = config.webhookSecret || null;
    assertProvider(this);
  }

  async _call(kind, body, idempotencyKey) {
    const url = this.urls[kind];
    if (!url) {
      throw new NotImplementedError({
        message: `Provider '${this.code}' has no configured ${kind} endpoint.`,
      });
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}),
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Provider '${this.code}' ${kind} failed with HTTP ${response.status}.`);
    }
    return response.json();
  }

  initiate(input) {
    return this._call(
      'initiate',
      {
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        orderId: input.orderId,
        referenceKey: input.idempotencyKey,
      },
      input.idempotencyKey,
    );
  }

  verify(input) {
    return this._call(
      'verify',
      { providerReference: input.providerReference, idempotencyKey: input.idempotencyKey },
      input.idempotencyKey,
    );
  }

  refund(input) {
    return this._call(
      'refund',
      {
        providerReference: input.providerReference,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      },
      input.idempotencyKey,
    );
  }

  verifyWebhook({ headers = {}, eventId, payload }) {
    if (!this.webhookSecret) {
      throw new NotImplementedError({
        message: `Provider '${this.code}' has no configured webhook secret.`,
      });
    }
    const expected = `sha256=${createHmac('sha256', this.webhookSecret)
      .update(`${eventId}.${JSON.stringify(payload)}`)
      .digest('hex')}`;
    const supplied = headers['x-webhook-signature'];
    if (typeof supplied !== 'string' || supplied.length !== expected.length) {
      throw new UnauthorizedError({ message: 'Webhook signature is invalid.' });
    }
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new UnauthorizedError({ message: 'Webhook signature is invalid.' });
    }
    return true;
  }

  normalizeWebhook(payload) {
    return {
      providerEventId: payload.eventId,
      providerReference: payload.paymentReference,
      status: payload.status,
      amount: payload.amount,
      currency: payload.currency,
      failureCode: payload.failureCode,
    };
  }

  describe() {
    return {
      code: this.code,
      methods: [...this.methods],
      capabilities: ['initiate', 'verify', 'refund', 'webhooks'],
    };
  }
}

module.exports = { HttpPaymentProvider };
