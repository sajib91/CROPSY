const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, DomainError, NotFoundError } = require('../../../shared/kernel/errors');
const { BALANCE_BUCKETS } = require('../domain/ledger.entity');
const { LEDGER_STORE_METHODS, LedgerStoreToken } = require('../domain/ledger.repository');

function translateError(error) {
  if (
    error instanceof ConflictError ||
    error instanceof DomainError ||
    error instanceof NotFoundError
  ) {
    return error;
  }
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A ledger reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Ledger record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23503', '23514', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Ledger operation was rejected.',
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
  const amount = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DomainError({ message: 'Ledger amounts must be finite and non-negative.' });
  }
  return amount;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (['limit', 'offset'].includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) where[key] = { in: value };
    else where[key] = value;
  }
  return where;
}

function assertBalanced(lines) {
  const debit = money(
    lines
      .filter((line) => line.direction === 'DEBIT')
      .reduce((sum, line) => sum + money(line.amount), 0),
  );
  const credit = money(
    lines
      .filter((line) => line.direction === 'CREDIT')
      .reduce((sum, line) => sum + money(line.amount), 0),
  );
  if (lines.length < 2 || debit <= 0 || debit !== credit) {
    throw new DomainError({
      code: 'unbalanced_journal',
      message: 'Every posted journal must have at least two balanced lines.',
      details: { debit, credit },
    });
  }
}

function ownerKey(line) {
  return line.owner_user_id || 'PLATFORM';
}

function signedAmount(line, account) {
  const amount = money(line.amount);
  return line.direction === account.normal_balance ? amount : -amount;
}

class LedgerPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('LedgerPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, LEDGER_STORE_METHODS, LedgerStoreToken);
  }

  async ensureAccounts(inputs = []) {
    try {
      await this.prisma.ledgerAccount.createMany({
        data: inputs.map((input) => ({
          organization_id: input.organization_id ?? null,
          code: input.code,
          name: input.name,
          account_type: input.accountType,
          normal_balance: input.normalBalance,
          currency: input.currency || 'BDT',
        })),
        skipDuplicates: true,
      });
      return this.listAccounts({ limit: 200 });
    } catch (error) {
      throw translateError(error);
    }
  }

  async listAccounts(filters = {}) {
    try {
      const rows = await this.prisma.ledgerAccount.findMany({
        where: whereFrom(filters),
        orderBy: { code: 'asc' },
        take: Number(filters.limit || 50),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async _resolveAccounts(client, codes) {
    const uniqueCodes = [...new Set(codes)];
    const accounts = await client.ledgerAccount.findMany({
      where: { code: { in: uniqueCodes } },
    });
    const byCode = new Map(accounts.map((account) => [account.code, account]));
    for (const code of uniqueCodes) {
      const account = byCode.get(code);
      if (!account) throw new NotFoundError({ message: `Ledger account '${code}' was not found.` });
      if (!account.is_active) {
        throw new DomainError({ message: `Ledger account '${code}' is inactive.` });
      }
    }
    return byCode;
  }

  async _postJournalWithClient(client, input) {
    const existing = await client.ledgerJournal.findUnique({
      where: { idempotency_key: input.idempotency_key },
    });
    if (existing) return normalize(existing);

    assertBalanced(input.lines);
    if (input.lines.some((line) => !BALANCE_BUCKETS.includes(line.bucket))) {
      throw new DomainError({ message: 'Invalid ledger balance bucket.' });
    }
    const currency = input.currency || 'BDT';
    const accounts = await this._resolveAccounts(
      client,
      input.lines.map((line) => line.account_code),
    );
    const journal = await client.ledgerJournal.create({
      data: {
        id: input.id || randomUUID(),
        organization_id: input.organization_id ?? null,
        idempotency_key: input.idempotency_key,
        reference_type: input.reference_type,
        reference_id: input.reference_id ?? null,
        description: input.description ?? null,
        currency,
        status: 'POSTED',
        actor_user_id: input.actor_user_id ?? null,
        request_id: input.request_id ?? null,
        posted_at: new Date(),
        lines: {
          create: input.lines.map((line) => ({
            organization_id: input.organization_id ?? null,
            account_id: accounts.get(line.account_code).id,
            direction: line.direction,
            bucket: line.bucket,
            amount: money(line.amount),
            currency,
            owner_user_id: line.owner_user_id ?? null,
            description: line.description ?? null,
          })),
        },
      },
    });

    for (const line of input.lines) {
      const account = accounts.get(line.account_code);
      await client.ledgerBalance.upsert({
        where: {
          account_id_owner_key_bucket_currency: {
            account_id: account.id,
            owner_key: ownerKey(line),
            bucket: line.bucket,
            currency,
          },
        },
        create: {
          organization_id: input.organization_id ?? null,
          account_id: account.id,
          owner_key: ownerKey(line),
          owner_user_id: line.owner_user_id ?? null,
          bucket: line.bucket,
          currency,
          balance: signedAmount(line, account),
        },
        update: {
          balance: { increment: signedAmount(line, account) },
        },
      });
    }

    if (input.expectation_key) {
      const expectation = await client.reconciliationExpectation.findUnique({
        where: { expectation_key: input.expectation_key },
      });
      if (expectation && expectation.status !== 'MATCHED') {
        await client.reconciliationExpectation.update({
          where: { id: expectation.id },
          data: { status: 'MATCHED', journal_id: journal.id, matched_at: new Date() },
        });
      }
    }

    await client.ledgerAuditEvent.create({
      data: {
        organization_id: input.organization_id ?? null,
        action: 'ledger.journal.posted',
        actor_user_id: input.actor_user_id ?? null,
        entity_type: 'ledger_journal',
        entity_id: journal.id,
        metadata: {
          idempotencyKey: input.idempotency_key,
          referenceType: input.reference_type,
          referenceId: input.reference_id ?? null,
        },
        request_id: input.request_id ?? null,
      },
    });
    return normalize(journal);
  }

  async postJournal(input) {
    try {
      return await this.prisma.$transaction((transaction) =>
        this._postJournalWithClient(transaction, input),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async findJournalByIdempotency(idempotencyKey) {
    try {
      const journal = await this.prisma.ledgerJournal.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      return normalize(journal);
    } catch (error) {
      throw translateError(error);
    }
  }

  async getJournal(journalId) {
    try {
      const journal = await this.prisma.ledgerJournal.findUnique({
        where: { id: journalId },
        include: { lines: true },
      });
      if (!journal) throw new NotFoundError({ message: 'Ledger journal was not found.' });
      return normalize(journal);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listJournals(filters = {}) {
    try {
      const rows = await this.prisma.ledgerJournal.findMany({
        where: whereFrom(filters),
        orderBy: { posted_at: 'desc' },
        take: Number(filters.limit || 50),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async _accountId(client, code) {
    const account = await client.ledgerAccount.findFirst({ where: { code } });
    if (!account) throw new NotFoundError({ message: `Ledger account '${code}' was not found.` });
    return account.id;
  }

  async getBalance(filters = {}) {
    try {
      const accountId = await this._accountId(this.prisma, filters.account_code);
      const currency = filters.currency || 'BDT';
      const balance = await this.prisma.ledgerBalance.findUnique({
        where: {
          account_id_owner_key_bucket_currency: {
            account_id: accountId,
            owner_key: filters.owner_key || filters.ownerKey || 'PLATFORM',
            bucket: filters.bucket,
            currency,
          },
        },
      });
      return normalize(balance);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listBalances(filters = {}) {
    try {
      const where = whereFrom(filters);
      if (filters.account_code) {
        where.account_id = await this._accountId(this.prisma, filters.account_code);
        delete where.account_code;
      }
      const rows = await this.prisma.ledgerBalance.findMany({
        where,
        orderBy: { bucket: 'asc' },
        take: Number(filters.limit || 50),
        skip: Number(filters.offset || 0),
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async recordExpectation(input) {
    try {
      const existing = await this.prisma.reconciliationExpectation.findUnique({
        where: { expectation_key: input.expectation_key },
      });
      if (existing) return normalize(existing);
      const expectation = await this.prisma.reconciliationExpectation.create({
        data: {
          organization_id: input.organization_id ?? null,
          expectation_key: input.expectation_key,
          reference_type: input.reference_type,
          reference_id: input.reference_id ?? null,
          amount: input.amount,
          currency: input.currency || 'BDT',
        },
      });
      return normalize(expectation);
    } catch (error) {
      throw translateError(error);
    }
  }

  async matchExpectation({ expectation_key, journal_id }) {
    try {
      const expectation = await this.prisma.reconciliationExpectation.findUnique({
        where: { expectation_key },
      });
      if (!expectation || expectation.status === 'MATCHED') return normalize(expectation);
      return normalize(
        await this.prisma.reconciliationExpectation.update({
          where: { id: expectation.id },
          data: { status: 'MATCHED', journal_id, matched_at: new Date() },
        }),
      );
    } catch (error) {
      throw translateError(error);
    }
  }

  async listExpectations(filters = {}) {
    try {
      const rows = await this.prisma.reconciliationExpectation.findMany({
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

  async createSettlement(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.settlement.findUnique({
          where: { idempotency_key: input.idempotency_key },
        });
        if (existing) {
          throw new ConflictError({ message: 'Settlement idempotency key is already in use.' });
        }
        const settlement = await transaction.settlement.create({
          data: {
            id: input.id || randomUUID(),
            organization_id: input.organization_id ?? null,
            seller_user_id: input.seller_user_id,
            rule_key: input.rule_key ?? null,
            idempotency_key: input.idempotency_key,
            period_start: input.period_start,
            period_end: input.period_end,
            gross_amount: input.gross_amount,
            deductions_amount: input.deductions_amount || 0,
            net_amount: input.net_amount,
            currency: input.currency || 'BDT',
            status: 'PAID',
            allocation_snapshot: input.allocation_snapshot || {},
            paid_at: new Date(),
          },
        });
        const journal = await this._postJournalWithClient(transaction, {
          ...input.journal,
          idempotency_key: `settlement:${input.idempotency_key}`,
          reference_type: 'SETTLEMENT',
          reference_id: settlement.id,
          organization_id: settlement.organization_id,
          currency: settlement.currency,
        });
        await transaction.settlement.update({
          where: { id: settlement.id },
          data: { journal_id: journal.id },
        });
        await transaction.ledgerAuditEvent.create({
          data: {
            organization_id: settlement.organization_id,
            action: 'ledger.settlement.recorded',
            actor_user_id: input.actor_user_id ?? null,
            entity_type: 'ledger_settlement',
            entity_id: settlement.id,
            metadata: { ruleKey: settlement.rule_key, netAmount: settlement.net_amount },
            request_id: input.request_id ?? null,
          },
        });
        return normalize({ ...settlement, journal_id: journal.id });
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async listSettlements(filters = {}) {
    try {
      const rows = await this.prisma.settlement.findMany({
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

  async appendAudit(input) {
    try {
      const event = await this.prisma.ledgerAuditEvent.create({
        data: {
          organization_id: input.organization_id ?? null,
          action: input.action,
          actor_user_id: input.actor_user_id ?? null,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          metadata: input.metadata || {},
          request_id: input.requestId ?? null,
        },
      });
      return normalize(event);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listAudit(filters = {}) {
    try {
      const rows = await this.prisma.ledgerAuditEvent.findMany({
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
}

module.exports = { LedgerPrismaStore };
