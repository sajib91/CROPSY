const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');

const { UnauthorizedError } = require('../../../shared/kernel/errors');
const { assertProvider } = require('../domain/payment-provider');

/**
 * Deterministic test adapter. It is registered only when
 * PAYMENT_PROVIDER_MODE=mock and NODE_ENV=test; production configuration
 * rejects this mode. No real provider credentials or endpoints are present.
 */
class MockPaymentProvider {
  constructor({ code, methods = [], webhookSecret }) {
    if (!code) throw new TypeError('MockPaymentProvider requires a provider code.');
    if (!webhookSecret) throw new TypeError('MockPaymentProvider requires a webhook secret.');
    this.code = code;
    this.methods = [...methods];
    this.webhookSecret = webhookSecret;
    assertProvider(this);
  }

  _digest(eventId, payload) {
    return createHmac('sha256', this.webhookSecret)
      .update(`${eventId}.${JSON.stringify(payload)}`)
      .digest('hex');
  }

  initiate(input) {
    if (input.providerOptions?.forceFailure) {
      return Promise.reject(new Error('Mock provider rejected the payment.'));
    }
    return Promise.resolve({
      providerReference: `mock-${randomUUID()}`,
      status: input.providerOptions?.initialStatus || 'AUTHORIZED',
      redirectUrl: null,
      instruction: 'Sandbox authorization recorded for automated tests.',
    });
  }

  verify(input) {
    if (input.providerOptions?.forceFailure) {
      return Promise.resolve({
        providerReference: input.providerReference,
        status: 'FAILED',
        failureCode: 'MOCK_DECLINED',
        failureMessage: 'Mock provider declined the payment.',
      });
    }
    return Promise.resolve({
      providerReference: input.providerReference,
      status: input.providerOptions?.verifiedStatus || 'CAPTURED',
    });
  }

  refund(input) {
    if (input.providerOptions?.forceFailure) {
      return Promise.resolve({
        providerReference: null,
        status: 'FAILED',
        failureCode: 'MOCK_REFUND_DECLINED',
        failureMessage: 'Mock provider declined the refund.',
      });
    }
    return Promise.resolve({
      providerReference: `mock-refund-${randomUUID()}`,
      status: 'PROCESSED',
    });
  }

  verifyWebhook({ headers = {}, eventId, payload }) {
    const supplied = headers['x-webhook-signature'];
    const expected = `sha256=${this._digest(eventId, payload)}`;
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

module.exports = { MockPaymentProvider };
