const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, PaymentsEntity } = require('../domain/payments.entity');
const {
  PAYMENT_STORE_METHODS,
  PaymentsRepositoryToken,
  PaymentsStoreToken,
} = require('../domain/payments.repository');
const { assertPaymentLedgerPort } = require('../domain/payment-ledger-port');
const {
  initiatePaymentSchema,
  listQuerySchema,
  moduleInfoSchema,
  refundSchema,
  toModuleInfoDto,
  verifyPaymentSchema,
  webhookSchema,
} = require('./payments.dto');

const PaymentsServiceToken = Symbol.for('cropsy.service.payments');
const IDENTITY_METHODS = Object.freeze(['appendAudit']);

const EVENTS = Object.freeze({
  INITIALIZED: 'payments.initialized',
  INITIATED: 'payments.payment.initiated',
  FAILED: 'payments.payment.failed',
  CAPTURED: 'payments.payment.captured',
  WEBHOOK_RECEIVED: 'payments.webhook.received',
  REFUNDED: 'payments.refund.processed',
});

const PROVIDER_STATUSES = Object.freeze([
  'INITIATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
]);

const TERMINAL_STATUSES = Object.freeze(['FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']);

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function requestMeta(request) {
  return {
    requestId: request?.requestId ?? null,
    ipAddress: request?.ip ?? null,
    userAgent: request?.headers?.['user-agent'] ?? null,
  };
}

function normalizeStatus(status, fallback = 'AUTHORIZED') {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  if (!PROVIDER_STATUSES.includes(normalized)) return fallback;
  return normalized;
}

function canTransition(from, to) {
  if (from === to) return false;
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = {
    INITIATED: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED'],
    AUTHORIZED: ['CAPTURED', 'FAILED', 'CANCELLED'],
  };
  return Boolean(allowed[from]?.includes(to));
}

class PaymentsService {
  constructor({
    repository,
    store,
    providerRegistry,
    ledger,
    eventBus,
    logger,
    metadata,
    config,
    identityStore,
    authorization,
  }) {
    assertRepository(repository, ['get', 'save'], PaymentsRepositoryToken);
    assertRepository(store, PAYMENT_STORE_METHODS, PaymentsStoreToken);
    assertRepository(providerRegistry, ['get', 'list', 'assertMethod'], 'PaymentProviderRegistry');
    assertPaymentLedgerPort(ledger);
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('PaymentsService requires an event bus.');
    }
    if (!metadata) throw new TypeError('PaymentsService requires module metadata.');
    for (const [name, dependency] of Object.entries({ config, authorization })) {
      if (!dependency) throw new TypeError(`PaymentsService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.providerRegistry = providerRegistry;
    this.ledger = ledger;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.config = config;
    this.identityStore = identityStore;
    this.authorization = authorization;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new PaymentsEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, data, 'payments module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.paymentId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, organizationId = null, metadata = {}, severity = 'INFO' },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: request?.auth?.user?.id || null,
      organizationId,
      after: { ...metadata, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.identityStore.appendAudit(entry);
    this.publish(action, entry.after, entityId);
  }

  async resolveTenantId(context) {
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) return null;
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertCanView(context, record, label = 'Payment') {
    if (context.isSuperAdmin) return record;
    if (record.user_id === context.user.id) return record;
    if (record.organization_id && record.organization_id === context.organizationId) return record;
    throw new ForbiddenError({ message: `${label} belongs to another owner.` });
  }

  assertCanManage(context, record, label = 'Payment') {
    if (context.isSuperAdmin) return record;
    if (record.organization_id && record.organization_id === context.organizationId) return record;
    throw new ForbiddenError({ message: `${label} cannot be managed in this context.` });
  }

  async providers() {
    return this.providerRegistry.list();
  }

  async initiate({ context, input, request }) {
    const body = validate(initiatePaymentSchema, input || {}, 'payment initiation');
    const organizationId = await this.resolveTenantId(context);
    const idempotencyKey = body.idempotencyKey;
    if (!idempotencyKey) {
      throw new ValidationError({ message: 'An idempotency key is required.' });
    }

    const existing = await this.store.findPaymentByIdempotency(idempotencyKey);
    if (existing) {
      this.assertCanView(context, existing);
      return existing;
    }

    const provider = this.providerRegistry.assertMethod(body.providerCode, body.method);
    const paymentId = randomUUID();
    await this.ledger.recordExpectation({
      expectation_key: `payment:${paymentId}`,
      reference_type: 'PAYMENT',
      reference_id: paymentId,
      amount: body.amount,
      currency: body.currency || 'BDT',
      organization_id: organizationId,
    });

    const base = {
      id: paymentId,
      organization_id: organizationId,
      order_id: body.orderId,
      purchase_group_id: body.purchaseGroupId ?? null,
      user_id: context.user.id,
      provider_code: body.providerCode,
      idempotency_key: idempotencyKey,
      method: body.method,
      amount: body.amount,
      currency: body.currency || 'BDT',
      metadata: { providerCode: body.providerCode },
      allocation_snapshot: body.allocation,
      commission_rule_snapshot: body.commissionRule,
    };

    let providerResult;
    try {
      providerResult = await provider.adapter.initiate({
        ...base,
        providerOptions: body.providerOptions,
      });
    } catch (error) {
      const payment = await this.store.initializePayment({
        ...base,
        status: 'FAILED',
        captured_amount: 0,
        metadata: { ...base.metadata, failureCode: 'PROVIDER_INITIATION_FAILED' },
      });
      await this.audit(
        {
          action: EVENTS.FAILED,
          entityType: 'payment',
          entityId: payment.id,
          organizationId,
          metadata: { idempotencyKey, providerCode: body.providerCode },
          severity: 'ERROR',
        },
        request,
      );
      this.logger?.warn(
        { paymentId: payment.id, providerCode: body.providerCode },
        'Payment initiation failed at provider',
      );
      return payment;
    }

    const status = normalizeStatus(providerResult.status);
    const payment = await this.store.initializePayment({
      ...base,
      provider_reference: providerResult.providerReference ?? null,
      status,
      captured_amount: status === 'CAPTURED' ? body.amount : 0,
      metadata: {
        ...base.metadata,
        redirectUrl: providerResult.redirectUrl ?? null,
        instruction: providerResult.instruction ?? null,
      },
    });

    if (status === 'CAPTURED') await this.postCaptureJournal(payment, request);
    await this.audit(
      {
        action: EVENTS.INITIATED,
        entityType: 'payment',
        entityId: payment.id,
        organizationId,
        metadata: { idempotencyKey, providerCode: body.providerCode, status },
      },
      request,
    );
    return payment;
  }

  async _accounts() {
    const accounts = await this.ledger.accountCodes();
    const required = ['BUYER_CLEARING', 'SELLER_PAYABLE', 'PLATFORM_REVENUE'];
    if (required.some((role) => !accounts[role])) {
      throw new DomainError({
        message: 'Ledger account configuration is missing a required payment role.',
      });
    }
    return accounts;
  }

  async postCaptureJournal(payment, request) {
    const accounts = await this._accounts();
    const allocation = payment.allocation_snapshot || {};
    const sellerNet = money(allocation.sellerNetAmount);
    const commission = money(allocation.commissionAmount);
    const amount = money(payment.captured_amount || payment.amount);
    const lines = [
      {
        account_code: accounts.BUYER_CLEARING,
        direction: 'DEBIT',
        bucket: 'PENDING',
        amount,
      },
      {
        account_code: accounts.SELLER_PAYABLE,
        direction: 'CREDIT',
        bucket: 'PENDING',
        amount: sellerNet,
        owner_user_id: allocation.sellerUserId ?? null,
      },
    ];
    if (commission > 0) {
      lines.push({
        account_code: accounts.PLATFORM_REVENUE,
        direction: 'CREDIT',
        bucket: 'AVAILABLE',
        amount: commission,
      });
    }
    return this.ledger.postJournal({
      idempotency_key: `payment:${payment.id}:CAPTURE`,
      reference_type: 'PAYMENT_CAPTURE',
      reference_id: payment.id,
      description: 'Buyer payment captured',
      currency: payment.currency,
      expectation_key: `payment:${payment.id}`,
      organization_id: payment.organization_id,
      actor_user_id: request?.auth?.user?.id ?? null,
      request_id: requestMeta(request).requestId,
      lines,
    });
  }

  async verify({ context, paymentId, input, request }) {
    const body = validate(verifyPaymentSchema, input || {}, 'payment verification');
    const existing = await this.store.findPayment({ id: paymentId });
    if (!existing) throw new NotFoundError({ message: 'Payment was not found.' });
    this.assertCanManage(context, existing);
    const provider = this.providerRegistry.get(existing.provider_code);
    const result = await provider.adapter.verify({
      ...existing,
      providerOptions: body.providerOptions,
      idempotencyKey: existing.idempotency_key,
    });
    const status = normalizeStatus(result.status, 'CAPTURED');
    if (status === existing.status) return existing;
    if (!canTransition(existing.status, status)) {
      throw new ConflictError({
        message: `Payment cannot transition from ${existing.status} to ${status}.`,
      });
    }

    if (status === 'CAPTURED') {
      await this.postCaptureJournal(existing, request);
    }
    const payment = await this.store.appendPaymentStatus({
      payment_id: existing.id,
      organization_id: existing.organization_id,
      from_status: existing.status,
      to_status: status,
      captured_amount: status === 'CAPTURED' ? existing.amount : existing.captured_amount,
      reason: result.failureCode || 'provider_verification',
      actor_user_id: context.user.id,
      metadata: {
        failureCode: result.failureCode ?? null,
        failureMessage: result.failureMessage ?? null,
      },
    });
    await this.audit(
      {
        action: status === 'CAPTURED' ? EVENTS.CAPTURED : EVENTS.FAILED,
        entityType: 'payment',
        entityId: payment.id,
        organizationId: payment.organization_id,
        metadata: { status },
        severity: status === 'FAILED' ? 'ERROR' : 'INFO',
      },
      request,
    );
    return payment;
  }

  async handleWebhook({ providerCode, input, headers, request }) {
    const body = validate(webhookSchema, input || {}, 'payment webhook');
    const provider = this.providerRegistry.get(providerCode);
    provider.adapter.verifyWebhook({
      headers,
      eventId: body.eventId,
      payload: body,
    });

    const existingEvent = await this.store.findWebhookEvent(providerCode, body.eventId);
    if (existingEvent) {
      const payment = existingEvent.payment_id
        ? await this.store.findPayment({ id: existingEvent.payment_id })
        : null;
      return { ...existingEvent, payment, duplicate: true };
    }

    const normalized = provider.adapter.normalizeWebhook(body);
    if (!normalized.providerReference || !normalized.status) {
      throw new ValidationError({ message: 'Webhook payload could not be normalized.' });
    }
    const payment = await this.store.findPaymentByReference(
      providerCode,
      normalized.providerReference,
    );
    const registered = await this.store.registerWebhookEvent({
      provider_code: providerCode,
      provider_event_id: body.eventId,
      payment_id: payment?.id ?? null,
      organization_id: payment?.organization_id ?? null,
      payload: body,
      signature: headers?.['x-webhook-signature'] ?? null,
    });
    if (registered.duplicate) return { ...registered.event, duplicate: true };

    await this.audit(
      {
        action: EVENTS.WEBHOOK_RECEIVED,
        entityType: 'payment_webhook_event',
        entityId: registered.event.id,
        organizationId: payment?.organization_id ?? null,
        metadata: { providerCode, eventId: body.eventId },
      },
      request,
    );

    if (!payment) {
      await this.store.failWebhookEvent({
        event_id: registered.event.id,
        error: 'Payment reference was not found.',
      });
      throw new NotFoundError({ message: 'Webhook payment reference was not found.' });
    }

    const status = normalizeStatus(normalized.status, payment.status);
    if (!canTransition(payment.status, status)) {
      const completed = await this.store.completeWebhookEvent({
        event_id: registered.event.id,
        payment_id: payment.id,
        skip_status: true,
        reason: 'duplicate_or_terminal_state',
      });
      return { ...completed.event, payment, duplicate: true };
    }

    if (status === 'CAPTURED') {
      const amount = money(normalized.amount ?? payment.amount);
      if (amount !== money(payment.amount)) {
        await this.store.failWebhookEvent({
          event_id: registered.event.id,
          error: 'Webhook amount does not match the payment.',
        });
        throw new ConflictError({ message: 'Webhook amount does not match the payment.' });
      }
      await this.postCaptureJournal(payment, request);
    }

    const completed = await this.store.completeWebhookEvent({
      event_id: registered.event.id,
      payment_id: payment.id,
      to_status: status,
      captured_amount: status === 'CAPTURED' ? payment.amount : payment.captured_amount,
      reason: normalized.failureCode || 'provider_webhook',
      provider_event_id: body.eventId,
      metadata: { failureCode: normalized.failureCode ?? null },
    });
    if (status === 'CAPTURED') {
      await this.audit(
        {
          action: EVENTS.CAPTURED,
          entityType: 'payment',
          entityId: payment.id,
          organizationId: payment.organization_id,
          metadata: { source: 'webhook', eventId: body.eventId },
        },
        request,
      );
    }
    return { ...completed.event, payment: completed.payment, duplicate: false };
  }

  async refund({ context, input, request }) {
    const body = validate(refundSchema, input || {}, 'payment refund');
    const payment = await this.store.findPayment({ id: body.paymentId });
    if (!payment) throw new NotFoundError({ message: 'Payment was not found.' });
    this.assertCanManage(context, payment);
    if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new ConflictError({ message: 'Only captured payments can be refunded.' });
    }
    const available = money(payment.captured_amount - payment.refunded_amount);
    if (money(body.amount) > available) {
      throw new ConflictError({ message: 'Refund amount exceeds the refundable balance.' });
    }

    if (!body.idempotencyKey) {
      throw new ValidationError({ message: 'An idempotency key is required.' });
    }
    const existing = await this.store.findRefundByIdempotency(body.idempotencyKey);
    if (existing) {
      this.assertCanManage(context, payment);
      return existing;
    }

    const organizationId = await this.resolveTenantId(context);
    const provider = this.providerRegistry.get(payment.provider_code);
    const result = await provider.adapter.refund({
      providerReference: payment.provider_reference,
      amount: body.amount,
      currency: payment.currency,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      providerOptions: body.providerOptions,
    });
    const status = String(result.status || '').toUpperCase() === 'FAILED' ? 'FAILED' : 'PROCESSED';
    const refund = await this.store.recordRefund({
      id: randomUUID(),
      organization_id: organizationId,
      payment_id: payment.id,
      order_id: payment.order_id,
      amount: body.amount,
      currency: payment.currency,
      reason: body.reason,
      status,
      provider_reference: result.providerReference ?? null,
      idempotency_key: body.idempotencyKey,
      actor_user_id: context.user.id,
      allocation_snapshot: body.allocation,
    });

    if (status === 'PROCESSED') {
      const accounts = await this._accounts();
      const sellerNet = money(body.allocation.sellerNetAmount);
      const commissionReversal = money(body.allocation.commissionReversalAmount);
      const lines = [
        {
          account_code: accounts.SELLER_PAYABLE,
          direction: 'DEBIT',
          bucket: 'PENDING',
          amount: sellerNet,
          owner_user_id: body.allocation.sellerUserId,
        },
      ];
      if (commissionReversal > 0) {
        lines.push({
          account_code: accounts.PLATFORM_REVENUE,
          direction: 'DEBIT',
          bucket: 'AVAILABLE',
          amount: commissionReversal,
        });
      }
      lines.push({
        account_code: accounts.BUYER_CLEARING,
        direction: 'CREDIT',
        bucket: 'PENDING',
        amount: money(body.amount),
      });
      await this.ledger.postJournal({
        idempotency_key: `refund:${refund.id}`,
        reference_type: 'REFUND',
        reference_id: refund.id,
        description: 'Buyer refund processed',
        currency: payment.currency,
        organization_id: payment.organization_id,
        actor_user_id: context.user.id,
        request_id: requestMeta(request).requestId,
        lines,
      });
    }

    await this.audit(
      {
        action: EVENTS.REFUNDED,
        entityType: 'payment_refund',
        entityId: refund.id,
        organizationId,
        metadata: { paymentId: payment.id, amount: refund.amount, status },
        severity: status === 'FAILED' ? 'ERROR' : 'INFO',
      },
      request,
    );
    return refund;
  }

  async payments({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'payment list query');
    const organizationId = await this.resolveTenantId(context);
    const rows = await this.store.listPayments({
      organization_id: organizationId,
      user_id: context.isSuperAdmin ? undefined : context.user.id,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
    return rows.filter((row) => {
      try {
        this.assertCanView(context, row);
        return true;
      } catch {
        return false;
      }
    });
  }

  async payment({ context, paymentId }) {
    const record = await this.store.findPayment({ id: paymentId });
    if (!record) throw new NotFoundError({ message: 'Payment was not found.' });
    return this.assertCanView(context, record);
  }

  async history({ context, paymentId, query }) {
    const record = await this.payment({ context, paymentId });
    const filters = validate(listQuerySchema, query || {}, 'payment history query');
    return this.store.listPaymentStatusChanges({
      payment_id: record.id,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  async refunds({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'refund list query');
    const organizationId = await this.resolveTenantId(context);
    const payments = await this.store.listPayments({
      organization_id: organizationId,
      user_id: context.isSuperAdmin ? undefined : context.user.id,
      limit: 200,
    });
    const paymentIds = payments.map((payment) => payment.id);
    const rows = await this.store.listRefunds({
      limit: filters.limit,
      offset: filters.offset,
    });
    return rows.filter((refund) => paymentIds.includes(refund.payment_id));
  }
}

module.exports = {
  EVENTS,
  PaymentsService,
  PaymentsServiceToken,
};
