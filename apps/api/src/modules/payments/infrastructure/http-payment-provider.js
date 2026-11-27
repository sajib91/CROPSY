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

  verifyWebhook({ headers = {}, eventId, payload, rawBody }) {
    if (!this.webhookSecret) {
      throw new NotImplementedError({
        message: `Provider '${this.code}' has no configured webhook secret.`,
      });
    }
    const signedBody =
      rawBody === undefined || rawBody === null
        ? JSON.stringify(payload)
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : String(rawBody);
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${eventId}.${signedBody}`)
      .digest('hex');
    const supplied = headers['x-webhook-signature'];
    const match = typeof supplied === 'string' ? /^sha256=([0-9a-f]{64})$/i.exec(supplied) : null;
    if (!match) throw new UnauthorizedError({ message: 'Webhook signature is invalid.' });
    const suppliedDigest = Buffer.from(match[1], 'utf8');
    const expectedDigest = Buffer.from(expected, 'utf8');
    if (
      suppliedDigest.length !== expectedDigest.length ||
      !timingSafeEqual(suppliedDigest, expectedDigest)
    ) {
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
