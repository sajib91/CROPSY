const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { PAYMENT_STORE_METHODS, PaymentsStoreToken } = require('../domain/payments.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function matches(record, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (['limit', 'offset'].includes(key)) return true;
    if (value === undefined || value === null) return true;
    if (key === 'statuses') return value.includes(record.status);
    if (key === 'since') return new Date(record.created_at) >= new Date(value);
    return record[key] === value;
  });
}

function paginate(rows, filters = {}) {
  const offset = Number(filters.offset || 0);
  return [...rows].slice(offset, offset + Number(filters.limit || 50));
}

function applyPaymentStatus(payment, input, now) {
  const previous = payment.status;
  payment.status = input.to_status;
  payment.updated_at = now;
  if (input.captured_amount !== undefined) {
    payment.captured_amount = money(input.captured_amount);
  }
  if (input.refunded_amount !== undefined) {
    payment.refunded_amount = money(input.refunded_amount);
  }
  if (input.to_status === 'CAPTURED' && !payment.captured_at) payment.captured_at = now;
  if (input.to_status === 'FAILED' && !payment.failed_at) payment.failed_at = now;
  return previous;
}

function statusChange(input, fromStatus, now) {
  return {
    id: randomUUID(),
    organization_id: input.organization_id ?? null,
    payment_id: input.payment_id,
    from_status: fromStatus ?? null,
    to_status: input.to_status,
    reason: input.reason ?? null,
    actor_user_id: input.actor_user_id ?? null,
    provider_event_id: input.provider_event_id ?? null,
    metadata: clone(input.metadata || {}),
    created_at: now,
  };
}

/**
 * In-memory payment persistence. Every method is synchronous in practice, but
 * multi-row operations validate keys before mutating so callers observe the
 * same conflict semantics as the Prisma adapter.
 */
class PaymentsInMemoryStore {
  constructor() {
    this.payments = new Map();
    this.statusChanges = new Map();
    this.webhookEvents = new Map();
    this.refunds = new Map();
    assertRepository(this, PAYMENT_STORE_METHODS, PaymentsStoreToken);
  }

  initializePayment(input) {
    const duplicate = [...this.payments.values()].find(
      (payment) => payment.idempotency_key === input.idempotency_key,
    );
    if (duplicate) {
      if (
        duplicate.user_id !== input.user_id ||
        duplicate.organization_id !== (input.organization_id ?? null) ||
        money(duplicate.amount) !== money(input.amount)
      ) {
        throw new ConflictError({ message: 'Payment idempotency key is already in use.' });
      }
      return Promise.resolve(clone(duplicate));
    }
    if (input.provider_reference) {
      const referenceDuplicate = [...this.payments.values()].find(
        (payment) =>
          payment.provider_code === input.provider_code &&
          payment.provider_reference === input.provider_reference,
      );
      if (referenceDuplicate) {
        throw new ConflictError({ message: 'Provider payment reference is already in use.' });
      }
    }

    const now = new Date();
    const payment = {
      id: input.id || randomUUID(),
      organization_id: input.organization_id ?? null,
      order_id: input.order_id,
      purchase_group_id: input.purchase_group_id ?? null,
      user_id: input.user_id,
      provider_code: input.provider_code,
      provider_reference: input.provider_reference ?? null,
      idempotency_key: input.idempotency_key,
      method: input.method,
      status: input.status || 'INITIATED',
      amount: money(input.amount),
      captured_amount: money(input.captured_amount),
      refunded_amount: 0,
      currency: input.currency,
      initiated_at: now,
      captured_at: input.status === 'CAPTURED' ? now : null,
      failed_at: input.status === 'FAILED' ? now : null,
      metadata: clone(input.metadata || {}),
      allocation_snapshot: clone(input.allocation_snapshot || {}),
      commission_rule_snapshot: clone(input.commission_rule_snapshot || {}),
      created_at: now,
      updated_at: now,
    };
    this.payments.set(payment.id, payment);
    const change = statusChange(
      { ...input, payment_id: payment.id, to_status: payment.status, reason: 'initiated' },
      null,
      now,
    );
    this.statusChanges.set(change.id, change);
    return Promise.resolve(clone(payment));
  }

  claimPayment(input) {
    const existing = [...this.payments.values()].find(
      (payment) => payment.idempotency_key === input.idempotency_key,
    );
    if (existing) {
      if (
        existing.user_id !== input.user_id ||
        existing.organization_id !== (input.organization_id ?? null) ||
        existing.provider_code !== input.provider_code ||
        existing.method !== input.method ||
        money(existing.amount) !== money(input.amount) ||
        existing.currency !== (input.currency || 'BDT')
      ) {
        throw new ConflictError({ message: 'Payment idempotency key is already in use.' });
      }
      if (existing.metadata?.claimPending === true) {
        throw new ConflictError({ message: 'Payment initiation is already in progress.' });
      }
      return Promise.resolve({ payment: clone(existing), claimed: false });
    }

    const now = new Date();
    const payment = {
      id: input.id || randomUUID(),
      organization_id: input.organization_id ?? null,
      order_id: input.order_id,
      purchase_group_id: input.purchase_group_id ?? null,
      user_id: input.user_id,
      provider_code: input.provider_code,
      provider_reference: null,
      idempotency_key: input.idempotency_key,
      method: input.method,
      status: 'INITIATED',
      amount: money(input.amount),
      captured_amount: 0,
      refunded_amount: 0,
      currency: input.currency || 'BDT',
      metadata: { ...clone(input.metadata || {}), claimPending: true },
      allocation_snapshot: clone(input.allocation_snapshot || {}),
      commission_rule_snapshot: clone(input.commission_rule_snapshot || {}),
      initiated_at: now,
      captured_at: null,
      failed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.payments.set(payment.id, payment);
    const change = statusChange(
      { ...input, payment_id: payment.id, to_status: 'INITIATED', reason: 'payment_claimed' },
      null,
      now,
    );
    this.statusChanges.set(change.id, change);
    return Promise.resolve({ payment: clone(payment), claimed: true });
  }

  finalizePayment(input) {
    const payment = this.payments.get(input.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    if (payment.metadata?.claimPending !== true && payment.status === input.status) {
      return Promise.resolve(clone(payment));
    }

    if (input.provider_reference) {
      const duplicate = [...this.payments.values()].find(
        (candidate) =>
          candidate.id !== payment.id &&
          candidate.provider_code === payment.provider_code &&
          candidate.provider_reference === input.provider_reference,
      );
      if (duplicate) {
        throw new ConflictError({ message: 'Provider payment reference is already in use.' });
      }
    }

    const now = new Date();
    const previous = payment.status;
    payment.provider_reference = input.provider_reference ?? payment.provider_reference;
    payment.status = input.status;
    payment.captured_amount =
      input.captured_amount === undefined ? payment.captured_amount : money(input.captured_amount);
    payment.metadata = {
      ...clone(payment.metadata || {}),
      ...clone(input.metadata || {}),
      claimPending: false,
    };
    payment.updated_at = now;
    if (input.status === 'CAPTURED' && !payment.captured_at) payment.captured_at = now;
    if (input.status === 'FAILED' && !payment.failed_at) payment.failed_at = now;

    if (previous !== input.status) {
      const change = statusChange(
        {
          ...input,
          payment_id: payment.id,
          organization_id: payment.organization_id,
          to_status: input.status,
          reason: input.reason || 'provider_response',
        },
        previous,
        now,
      );
      this.statusChanges.set(change.id, change);
    }
    return Promise.resolve(clone(payment));
  }

  findPayment(filters = {}) {
    const payment = [...this.payments.values()].find((candidate) => matches(candidate, filters));
    return Promise.resolve(clone(payment));
  }

  findPaymentByIdempotency(idempotencyKey) {
    const payment = [...this.payments.values()].find(
      (candidate) => candidate.idempotency_key === idempotencyKey,
    );
    return Promise.resolve(clone(payment));
  }

  findPaymentByReference(providerCode, providerReference) {
    const payment = [...this.payments.values()].find(
      (candidate) =>
        candidate.provider_code === providerCode &&
        candidate.provider_reference === providerReference,
    );
    return Promise.resolve(clone(payment));
  }

  listPayments(filters = {}) {
    const rows = [...this.payments.values()].filter((payment) => matches(payment, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  appendPaymentStatus(input) {
    const payment = this.payments.get(input.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    const now = new Date();
    const previous = applyPaymentStatus(payment, input, now);
    const change = statusChange(input, previous, now);
    this.statusChanges.set(change.id, change);
    return Promise.resolve(clone(payment));
  }

  listPaymentStatusChanges(filters = {}) {
    const rows = [...this.statusChanges.values()].filter((change) => matches(change, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, { ...filters, limit: filters.limit || 100 }).map(clone));
  }

  registerWebhookEvent(input) {
    const existing = [...this.webhookEvents.values()].find(
      (event) =>
        event.provider_code === input.provider_code &&
        event.provider_event_id === input.provider_event_id,
    );
    if (existing) return Promise.resolve({ event: clone(existing), duplicate: true });

    const now = new Date();
    const event = {
      id: randomUUID(),
      organization_id: input.organization_id ?? null,
      provider_code: input.provider_code,
      provider_event_id: input.provider_event_id,
      payment_id: input.payment_id ?? null,
      payload: clone(input.payload || {}),
      signature: input.signature ?? null,
      status: 'RECEIVED',
      error: null,
      received_at: now,
      processed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.webhookEvents.set(event.id, event);
    return Promise.resolve({ event: clone(event), duplicate: false });
  }

  findWebhookEvent(providerCode, providerEventId) {
    const event = [...this.webhookEvents.values()].find(
      (candidate) =>
        candidate.provider_code === providerCode && candidate.provider_event_id === providerEventId,
    );
    return Promise.resolve(clone(event));
  }

  completeWebhookEvent(input) {
    const event = this.webhookEvents.get(input.event_id);
    if (!event) throw new NotFoundError({ message: 'Webhook event was not found.' });
    const payment = this.payments.get(input.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });

    if (
      !input.skip_status &&
      input.expected_from_status !== undefined &&
      payment.status !== input.expected_from_status
    ) {
      event.status = 'PROCESSED';
      event.payment_id = payment.id;
      event.processed_at = new Date();
      event.updated_at = event.processed_at;
      event.error = null;
      return Promise.resolve({ event: clone(event), payment: clone(payment), skipped: true });
    }

    const now = new Date();
    const previous = input.skip_status ? payment.status : applyPaymentStatus(payment, input, now);
    if (!input.skip_status) {
      const change = statusChange(
        {
          ...input,
          organization_id: event.organization_id,
          payment_id: payment.id,
          provider_event_id: event.provider_event_id,
          reason: input.reason || 'webhook',
        },
        previous,
        now,
      );
      this.statusChanges.set(change.id, change);
    }
    event.status = 'PROCESSED';
    event.payment_id = payment.id;
    event.processed_at = now;
    event.updated_at = now;
    event.error = null;
    return Promise.resolve({ event: clone(event), payment: clone(payment) });
  }

  failWebhookEvent(input) {
    const event = this.webhookEvents.get(input.event_id);
    if (!event) throw new NotFoundError({ message: 'Webhook event was not found.' });
    const now = new Date();
    event.status = 'FAILED';
    event.error = input.error ?? 'webhook processing failed';
    event.updated_at = now;
    return Promise.resolve(clone(event));
  }

  recordRefund(input) {
    const duplicate = [...this.refunds.values()].find(
      (refund) => refund.idempotency_key === input.idempotency_key,
    );
    if (duplicate) {
      if (
        duplicate.payment_id !== input.payment_id ||
        money(duplicate.amount) !== money(input.amount)
      ) {
        throw new ConflictError({ message: 'Refund idempotency key is already in use.' });
      }
      return Promise.resolve(clone(duplicate));
    }

    const payment = this.payments.get(input.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    const now = new Date();
    const refund = {
      id: input.id || randomUUID(),
      organization_id: input.organization_id ?? null,
      payment_id: payment.id,
      order_id: input.order_id || payment.order_id,
      amount: money(input.amount),
      currency: input.currency || payment.currency,
      reason: input.reason || 'OTHER',
      status: input.status || 'PROCESSED',
      provider_reference: input.provider_reference ?? null,
      idempotency_key: input.idempotency_key,
      allocation_snapshot: clone(input.allocation_snapshot || {}),
      processed_at: now,
      created_at: now,
      updated_at: now,
    };
    this.refunds.set(refund.id, refund);
    if (refund.status !== 'PROCESSED') return Promise.resolve(clone(refund));

    const refundedAmount = money(payment.refunded_amount + refund.amount);
    const refundedStatus =
      refundedAmount >= money(payment.captured_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const previous = applyPaymentStatus(
      payment,
      { to_status: refundedStatus, refunded_amount: refundedAmount },
      now,
    );
    const change = statusChange(
      {
        payment_id: payment.id,
        organization_id: payment.organization_id,
        to_status: refundedStatus,
        reason: 'refund',
        actor_user_id: input.actor_user_id ?? null,
        metadata: { refundId: refund.id },
      },
      previous,
      now,
    );
    this.statusChanges.set(change.id, change);
    return Promise.resolve(clone(refund));
  }

  reserveRefund(input) {
    const duplicate = [...this.refunds.values()].find(
      (refund) => refund.idempotency_key === input.idempotency_key,
    );
    if (duplicate) {
      if (
        duplicate.payment_id !== input.payment_id ||
        money(duplicate.amount) !== money(input.amount) ||
        duplicate.organization_id !== (input.organization_id ?? null) ||
        String(duplicate.currency).toUpperCase() !== String(input.currency || 'BDT').toUpperCase()
      ) {
        throw new ConflictError({ message: 'Refund idempotency key is already in use.' });
      }
      return Promise.resolve({ refund: clone(duplicate), claimed: false });
    }

    const payment = this.payments.get(input.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new ConflictError({ message: 'Only captured payments can be refunded.' });
    }
    const pending = [...this.refunds.values()]
      .filter(
        (refund) =>
          refund.payment_id === payment.id && ['REQUESTED', 'APPROVED'].includes(refund.status),
      )
      .reduce((total, refund) => total + money(refund.amount), 0);
    const available = money(
      money(payment.captured_amount) - money(payment.refunded_amount) - money(pending),
    );
    if (money(input.amount) > available) {
      throw new ConflictError({ message: 'Refund amount exceeds the refundable balance.' });
    }

    const now = new Date();
    const refund = {
      id: input.id || randomUUID(),
      organization_id: input.organization_id ?? null,
      payment_id: payment.id,
      order_id: input.order_id || payment.order_id,
      amount: money(input.amount),
      currency: input.currency || payment.currency,
      reason: input.reason || 'OTHER',
      status: 'REQUESTED',
      provider_reference: null,
      idempotency_key: input.idempotency_key,
      allocation_snapshot: clone(input.allocation_snapshot || {}),
      processed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.refunds.set(refund.id, refund);
    return Promise.resolve({ refund: clone(refund), claimed: true });
  }

  finalizeRefund(input) {
    const refund = this.refunds.get(input.refund_id);
    if (!refund) throw new NotFoundError({ message: 'Refund was not found.' });
    if (refund.status !== 'REQUESTED') return Promise.resolve(clone(refund));

    const payment = this.payments.get(refund.payment_id);
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    const now = new Date();
    refund.status = input.status || 'PROCESSED';
    refund.provider_reference = input.provider_reference ?? refund.provider_reference;
    refund.processed_at = now;
    refund.updated_at = now;

    if (refund.status === 'PROCESSED') {
      const total = money(money(payment.refunded_amount) + money(refund.amount));
      if (total > money(payment.captured_amount)) {
        refund.status = 'FAILED';
        throw new ConflictError({ message: 'Refund amount exceeds the refundable balance.' });
      }
      const status = total >= money(payment.captured_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      const previous = applyPaymentStatus(
        payment,
        { to_status: status, refunded_amount: total },
        now,
      );
      const change = statusChange(
        {
          payment_id: payment.id,
          organization_id: payment.organization_id,
          to_status: status,
          reason: input.reason || 'refund',
          actor_user_id: input.actor_user_id ?? null,
          metadata: { refundId: refund.id },
        },
        previous,
        now,
      );
      this.statusChanges.set(change.id, change);
    }
    return Promise.resolve(clone(refund));
  }

  findRefundByIdempotency(idempotencyKey) {
    const refund = [...this.refunds.values()].find(
      (candidate) => candidate.idempotency_key === idempotencyKey,
    );
    return Promise.resolve(clone(refund));
  }

  listRefunds(filters = {}) {
    const rows = [...this.refunds.values()].filter((refund) => matches(refund, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, filters).map(clone));
  }
}

module.exports = { PaymentsInMemoryStore };
