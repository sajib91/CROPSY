const { assertRepository } = require('../../../shared/domain/repository');
const { ForbiddenError, DomainError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { DEFAULT_ACCOUNTS, MODULE_ID, LedgerEntity } = require('../domain/ledger.entity');
const {
  LEDGER_STORE_METHODS,
  LedgerRepositoryToken,
  LedgerStoreToken,
} = require('../domain/ledger.repository');

const {
  balanceQuerySchema,
  expectationSchema,
  listQuerySchema,
  moduleInfoSchema,
  postJournalSchema,
  settlementSchema,
  toModuleInfoDto,
} = require('./ledger.dto');

const LedgerServiceToken = Symbol.for('cropsy.service.ledger');
const IDENTITY_METHODS = Object.freeze(['appendAudit']);

const EVENTS = Object.freeze({
  INITIALIZED: 'ledger.initialized',
  JOURNAL_POSTED: 'ledger.journal.posted',
  RECONCILIATION_EXPECTED: 'ledger.reconciliation.expected',
  SETTLEMENT_RECORDED: 'ledger.settlement.recorded',
  ADJUSTMENT_POSTED: 'ledger.adjustment.posted',
});

function requestMeta(request) {
  return {
    requestId: request?.requestId ?? null,
    ipAddress: request?.ip ?? null,
    userAgent: request?.headers?.['user-agent'] ?? null,
  };
}

function parseAccounts(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_ACCOUNTS;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DomainError({ message: 'LEDGER_ACCOUNTS_JSON must contain valid JSON.' });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new DomainError({ message: 'LEDGER_ACCOUNTS_JSON must contain a non-empty array.' });
  }
  for (const account of parsed) {
    if (
      !account ||
      typeof account.code !== 'string' ||
      !['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(account.accountType) ||
      !['DEBIT', 'CREDIT'].includes(account.normalBalance)
    ) {
      throw new DomainError({ message: 'LEDGER_ACCOUNTS_JSON contains an invalid account.' });
    }
  }
  return parsed;
}

function mapLines(lines) {
  return lines.map((line) => ({
    account_code: line.accountCode,
    direction: line.direction,
    bucket: line.bucket,
    amount: line.amount,
    owner_user_id: line.ownerUserId ?? null,
    description: line.description ?? null,
  }));
}

class LedgerService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    config,
    identityStore,
    authorization,
  }) {
    assertRepository(repository, ['get', 'save'], LedgerRepositoryToken);
    assertRepository(store, LEDGER_STORE_METHODS, LedgerStoreToken);
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('LedgerService requires an event bus.');
    }
    if (!metadata) throw new TypeError('LedgerService requires module metadata.');
    for (const [name, dependency] of Object.entries({ store, config, authorization })) {
      if (!dependency) throw new TypeError(`LedgerService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.config = config;
    this.identityStore = identityStore;
    this.authorization = authorization;
  }

  async describe() {
    await this.store.ensureAccounts(parseAccounts(this.config.LEDGER_ACCOUNTS_JSON));
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new LedgerEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, data, 'ledger module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.journalId || payload?.settlementId || 'anonymous',
      payload,
    });
  }

  async resolveTenantId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await this.authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) return null;
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertTenant(record, organizationId, label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (record.organization_id !== organizationId) {
      throw new ForbiddenError({ message: `${label} belongs to another organization.` });
    }
    return record;
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
    await this.store.appendAudit({
      organization_id: organizationId,
      action,
      actor_user_id: entry.actorUserId,
      entityType,
      entityId,
      metadata: entry.after,
      requestId: meta.requestId,
    });
  }

  async _ensureAccounts() {
    await this.store.ensureAccounts(parseAccounts(this.config.LEDGER_ACCOUNTS_JSON));
  }

  /**
   * Internal posting port used by other modules. Input is already in the
   * persistence contract shape; balance and account invariants are enforced
   * again by the store and by database constraints.
   */
  async recordExpectation(input) {
    return this.store.recordExpectation(input);
  }

  async postJournalFromPort(input) {
    await this._ensureAccounts();
    return this.store.postJournal(input);
  }

  async getBalanceFromPort(filters) {
    return this.store.getBalance(filters);
  }

  async accountCodes() {
    const accounts = parseAccounts(this.config.LEDGER_ACCOUNTS_JSON);
    const codes = {};
    for (const account of accounts) {
      if (account.role) codes[account.role] = account.code;
    }
    return codes;
  }

  async postJournal({ context, input, request }) {
    const body = validate(postJournalSchema, input, 'ledger journal');
    const organizationId = await this.resolveTenantId(context, null);
    await this._ensureAccounts();

    const duplicate = await this.store.findJournalByIdempotency(body.idempotencyKey);
    if (duplicate) return this.store.getJournal(duplicate.id);

    const journal = await this.store.postJournal({
      organization_id: organizationId,
      idempotency_key: body.idempotencyKey,
      reference_type: body.referenceType,
      reference_id: body.referenceId ?? null,
      description: body.description ?? null,
      currency: body.currency || 'BDT',
      expectation_key: body.expectationKey ?? null,
      actor_user_id: context.user.id,
      request_id: requestMeta(request).requestId,
      lines: mapLines(body.lines),
    });
    await this.audit(
      {
        action:
          body.referenceType === 'ADJUSTMENT' ? EVENTS.ADJUSTMENT_POSTED : EVENTS.JOURNAL_POSTED,
        entityType: 'ledger_journal',
        entityId: journal.id,
        organizationId,
        metadata: { idempotencyKey: body.idempotencyKey },
      },
      request,
    );
    this.publish(EVENTS.JOURNAL_POSTED, { journalId: journal.id, organizationId }, journal.id);
    return this.store.getJournal(journal.id);
  }

  async createExpectation({ context, input }) {
    const body = validate(expectationSchema, input, 'ledger reconciliation expectation');
    const organizationId = await this.resolveTenantId(context, null);
    const expectation = await this.store.recordExpectation({
      organization_id: organizationId,
      expectation_key: body.expectationKey,
      reference_type: body.referenceType,
      reference_id: body.referenceId ?? null,
      amount: body.amount,
      currency: body.currency || 'BDT',
    });
    this.publish(
      EVENTS.RECONCILIATION_EXPECTED,
      { expectationId: expectation.id, organizationId },
      expectation.id,
    );
    return expectation;
  }

  async balances({ context, query }) {
    const filters = validate(balanceQuerySchema, query || {}, 'ledger balance query');
    const organizationId = await this.resolveTenantId(context, null);
    return this.store.listBalances({
      organization_id: organizationId,
      account_code: filters.accountCode,
      owner_key: filters.ownerKey,
      bucket: filters.bucket,
      currency: filters.currency,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  async journals({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'ledger journal query');
    const organizationId = await this.resolveTenantId(context, null);
    return this.store.listJournals({
      organization_id: organizationId,
      status: filters.status,
      reference_type: filters.referenceType,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  async journal({ context, journalId }) {
    const organizationId = await this.resolveTenantId(context, null);
    const journal = await this.store.getJournal(journalId);
    return this.assertTenant(journal, organizationId, 'Ledger journal');
  }

  async accounts({ context }) {
    const organizationId = await this.resolveTenantId(context, null);
    await this._ensureAccounts();
    return this.store.listAccounts({ organization_id: organizationId, limit: 200 });
  }

  async auditTrail({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'ledger audit query');
    const organizationId = await this.resolveTenantId(context, null);
    return this.store.listAudit({
      organization_id: organizationId,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  async createSettlement({ context, input, request }) {
    const body = validate(settlementSchema, input, 'ledger settlement');
    const organizationId = await this.resolveTenantId(context, null);
    if (body.grossAmount - body.deductionsAmount !== body.netAmount) {
      throw new DomainError({
        message: 'Settlement net amount must equal gross amount less deductions.',
      });
    }
    if (new Date(body.periodEnd) <= new Date(body.periodStart)) {
      throw new DomainError({ message: 'Settlement period end must follow period start.' });
    }
    await this._ensureAccounts();

    const settlement = await this.store.createSettlement({
      organization_id: organizationId,
      seller_user_id: body.sellerUserId,
      rule_key: body.ruleKey,
      idempotency_key: body.idempotencyKey,
      period_start: new Date(body.periodStart),
      period_end: new Date(body.periodEnd),
      gross_amount: body.grossAmount,
      deductions_amount: body.deductionsAmount,
      net_amount: body.netAmount,
      currency: body.currency || 'BDT',
      allocation_snapshot: body.allocationSnapshot,
      actor_user_id: context.user.id,
      request_id: requestMeta(request).requestId,
      journal: {
        idempotency_key: `settlement:${body.idempotencyKey}`,
        reference_type: 'SETTLEMENT',
        description: `Settlement under rule ${body.ruleKey}`,
        currency: body.currency || 'BDT',
        lines: mapLines(body.journal.lines),
      },
    });
    await this.audit(
      {
        action: EVENTS.SETTLEMENT_RECORDED,
        entityType: 'ledger_settlement',
        entityId: settlement.id,
        organizationId,
        metadata: { ruleKey: body.ruleKey, netAmount: body.netAmount },
      },
      request,
    );
    this.publish(
      EVENTS.SETTLEMENT_RECORDED,
      { settlementId: settlement.id, organizationId },
      settlement.id,
    );
    return settlement;
  }

  async settlements({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'ledger settlement query');
    const organizationId = await this.resolveTenantId(context, null);
    return this.store.listSettlements({
      organization_id: organizationId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  async reconciliation({ context, query }) {
    const filters = validate(listQuerySchema, query || {}, 'ledger reconciliation query');
    const organizationId = await this.resolveTenantId(context, null);
    const expectations = await this.store.listExpectations({
      organization_id: organizationId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
    const missing = expectations.filter(
      (expectation) => expectation.status !== 'MATCHED' || !expectation.journal_id,
    );
    return {
      expectations,
      missing,
      matched: expectations.filter((expectation) => !missing.includes(expectation)),
      balanced: missing.length === 0,
    };
  }
}

module.exports = {
  EVENTS,
  LedgerService,
  LedgerServiceToken,
};
