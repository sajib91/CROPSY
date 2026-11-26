const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { PAYMENT_STORE_METHODS, PaymentsStoreToken } = require('../domain/payments.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A payment reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Payment record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23503', '23514', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Payment operation was rejected.',
      });
    }
  }
  return error;
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) result[key] = normalize(entry);
    return result;
  }
  return value;
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (['limit', 'offset'].includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (key === 'statuses') where.status = { in: [...value] };
    else if (key === 'since') where.created_at = { ...(where.created_at || {}), gte: value };
    else if (Array.isArray(value)) where[key] = { in: value };
    else where[key] = value;
  }
  return where;
}

function assertDuplicateOwner(payment, input) {
  if (
    payment.user_id !== input.user_id ||
    payment.organization_id !== (input.organization_id ?? null) ||
    money(payment.amount) !== money(input.amount)
  ) {
    throw new ConflictError({ message: 'Payment idempotency key is already in use.' });
  }
}

class PaymentsPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('PaymentsPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, PAYMENT_STORE_METHODS, PaymentsStoreToken);
  }

  async initializePayment(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.payment.findUnique({
          where: { idempotency_key: input.idempotency_key },
        });
        if (existing) {
          assertDuplicateOwner(existing, input);
          return normalize(existing);
        }
        const payment = await transaction.payment.create({
          data: {
            id: input.id,
            organization_id: input.organization_id ?? null,
            order_id: input.order_id,
            purchase_group_id: input.purchase_group_id ?? null,
            user_id: input.user_id,
            provider_code: input.provider_code,
            provider_reference: input.provider_reference ?? null,
            idempotency_key: input.idempotency_key,
            method: input.method,
            status: input.status || 'INITIATED',
            amount: input.amount,
            captured_amount: input.captured_amount || 0,
            currency: input.currency || 'BDT',
            metadata: input.metadata || {},
            allocation_snapshot: input.allocation_snapshot || {},
            commission_rule_snapshot: input.commission_rule_snapshot || {},
            captured_at: input.status === 'CAPTURED' ? new Date() : null,
            failed_at: input.status === 'FAILED' ? new Date() : null,
            statusChanges: {
              create: {
                organization_id: input.organization_id ?? null,
                from_status: null,
                to_status: input.status || 'INITIATED',
                reason: 'initiated',
                actor_user_id: input.user_id,
                metadata: {},
              },
            },
          },
        });
        return normalize(payment);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPayment(filters = {}) {
    try {
      const payment = await this.prisma.payment.findFirst({ where: whereFrom(filters) });
      return normalize(payment);
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPaymentByIdempotency(idempotencyKey) {
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      return normalize(payment);
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPaymentByReference(providerCode, providerReference) {
    try {
      const found = await this.prisma.payment.findFirst({
        where: { provider_code: providerCode, provider_reference: providerReference },
      });
      return normalize(found);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listPayments(filters = {}) {
    try {
      const rows = await this.prisma.payment.findMany({
        where: whereFrom(filters),
        orderBy: { created_at: 'desc' },
        take: Number(filters.limit || 50),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async appendPaymentStatus(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUnique({ where: { id: input.payment_id } });
        if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
        const updated = await transaction.payment.update({
          where: { id: input.payment_id },
          data: {
            status: input.to_status,
            ...(input.captured_amount === undefined
              ? {}
              : { captured_amount: input.captured_amount }),
            ...(input.refunded_amount === undefined
              ? {}
              : { refunded_amount: input.refunded_amount }),
            ...(input.to_status === 'CAPTURED' && !payment.captured_at
              ? { captured_at: new Date() }
              : {}),
            ...(input.to_status === 'FAILED' && !payment.failed_at
              ? { failed_at: new Date() }
              : {}),
            statusChanges: {
              create: {
                organization_id: input.organization_id ?? payment.organization_id,
                from_status: payment.status,
                to_status: input.to_status,
                reason: input.reason ?? null,
                actor_user_id: input.actor_user_id ?? null,
                provider_event_id: input.provider_event_id ?? null,
                metadata: input.metadata || {},
              },
            },
          },
        });
        return normalize(updated);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async listPaymentStatusChanges(filters = {}) {
    try {
      const rows = await this.prisma.paymentStatusChange.findMany({
        where: whereFrom(filters),
        orderBy: { created_at: 'desc' },
        take: Number(filters.limit || 100),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async registerWebhookEvent(input) {
    try {
      const existing = await this.prisma.paymentWebhookEvent.findUnique({
        where: {
          provider_code_provider_event_id: {
            provider_code: input.provider_code,
            provider_event_id: input.provider_event_id,
          },
        },
      });
      if (existing) return { event: normalize(existing), duplicate: true };
      const event = await this.prisma.paymentWebhookEvent.create({
        data: {
          organization_id: input.organization_id ?? null,
          provider_code: input.provider_code,
          provider_event_id: input.provider_event_id,
          payment_id: input.payment_id ?? null,
          payload: input.payload || {},
          signature: input.signature ?? null,
          status: 'RECEIVED',
        },
      });
      return { event: normalize(event), duplicate: false };
    } catch (error) {
      if (error?.code === 'P2002') {
        const existing = await this.prisma.paymentWebhookEvent.findUnique({
          where: {
            provider_code_provider_event_id: {
              provider_code: input.provider_code,
              provider_event_id: input.provider_event_id,
            },
          },
        });
        if (existing) return { event: normalize(existing), duplicate: true };
      }
      throw translateError(error);
    }
  }

  async findWebhookEvent(providerCode, providerEventId) {
    try {
      const event = await this.prisma.paymentWebhookEvent.findUnique({
        where: {
          provider_code_provider_event_id: {
            provider_code: providerCode,
            provider_event_id: providerEventId,
          },
        },
      });
      return normalize(event);
    } catch (error) {
      throw translateError(error);
    }
  }

  async completeWebhookEvent(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        let payment = null;
        if (!input.skip_status) {
          const current = await transaction.payment.findUnique({ where: { id: input.payment_id } });
          if (!current) throw new NotFoundError({ message: 'Payment was not found.' });
          payment = await transaction.payment.update({
            where: { id: input.payment_id },
            data: {
              status: input.to_status,
              ...(input.captured_amount === undefined
                ? {}
                : { captured_amount: input.captured_amount }),
              ...(input.to_status === 'CAPTURED' && !current.captured_at
                ? { captured_at: new Date() }
                : {}),
              statusChanges: {
                create: {
                  organization_id: input.organization_id ?? current.organization_id,
                  from_status: current.status,
                  to_status: input.to_status,
                  reason: input.reason ?? 'webhook',
                  provider_event_id: input.provider_event_id ?? null,
                  metadata: input.metadata || {},
                },
              },
            },
          });
        } else {
          payment = await transaction.payment.findUnique({ where: { id: input.payment_id } });
        }
        const event = await transaction.paymentWebhookEvent.update({
          where: { id: input.event_id },
          data: {
            status: 'PROCESSED',
            payment_id: input.payment_id,
            processed_at: new Date(),
            error: null,
          },
        });
        return { event: normalize(event), payment: normalize(payment) };
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async failWebhookEvent(input) {
    try {
      const event = await this.prisma.paymentWebhookEvent.update({
        where: { id: input.event_id },
        data: { status: 'FAILED', error: input.error ?? 'webhook processing failed' },
      });
      return normalize(event);
    } catch (error) {
      throw translateError(error);
    }
  }

  async recordRefund(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.refund.findUnique({
          where: { idempotency_key: input.idempotency_key },
        });
        if (existing) {
          if (
            existing.payment_id !== input.payment_id ||
            money(existing.amount) !== money(input.amount)
          ) {
            throw new ConflictError({ message: 'Refund idempotency key is already in use.' });
          }
          return normalize(existing);
        }
        const payment = await transaction.payment.findUnique({ where: { id: input.payment_id } });
        if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
        const refund = await transaction.refund.create({
          data: {
            id: input.id,
            organization_id: input.organization_id ?? null,
            payment_id: payment.id,
            order_id: input.order_id || payment.order_id,
            amount: input.amount,
            currency: input.currency || payment.currency,
            reason: input.reason || 'OTHER',
            status: input.status || 'PROCESSED',
            provider_reference: input.provider_reference ?? null,
            idempotency_key: input.idempotency_key,
            allocation_snapshot: input.allocation_snapshot || {},
            processed_at: new Date(),
          },
        });
        if (input.status === 'FAILED') return normalize(refund);

        const refundedAmount = money(payment.refunded_amount + refund.amount);
        const status =
          refundedAmount >= money(payment.captured_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            refunded_amount: refundedAmount,
            status,
            statusChanges: {
              create: {
                organization_id: payment.organization_id,
                from_status: payment.status,
                to_status: status,
                reason: 'refund',
                actor_user_id: input.actor_user_id ?? null,
                metadata: { refundId: refund.id },
              },
            },
          },
        });
        return normalize(refund);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async findRefundByIdempotency(idempotencyKey) {
    try {
      const refund = await this.prisma.refund.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      return normalize(refund);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listRefunds(filters = {}) {
    try {
      const rows = await this.prisma.refund.findMany({
        where: whereFrom(filters),
        orderBy: { created_at: 'desc' },
        take: Number(filters.limit || 50),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }
}

module.exports = { PaymentsPrismaStore };
