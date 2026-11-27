const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, DomainError, NotFoundError } = require('../../../shared/kernel/errors');
const { BALANCE_BUCKETS } = require('../domain/ledger.entity');
const { LEDGER_STORE_METHODS, LedgerStoreToken } = require('../domain/ledger.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function money(value) {
  const amount = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DomainError({ message: 'Ledger amounts must be finite and non-negative.' });
  }
  return amount;
}

// Ledger balances are signed: a credit-heavy asset account, for example, can
// legitimately carry a negative balance until it is funded.
function balanceAmount(value) {
  const amount = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount)) {
    throw new DomainError({ message: 'Ledger balances must be finite.' });
  }
  return amount;
}

function assertSameJournal(existing, input) {
  const currency = input.currency || 'BDT';
  if (
    existing.reference_type !== input.reference_type ||
    (existing.reference_id ?? null) !== (input.reference_id ?? null) ||
    String(existing.currency).toUpperCase() !== String(currency).toUpperCase() ||
    (existing.organization_id ?? null) !== (input.organization_id ?? null)
  ) {
    throw new ConflictError({ message: 'Ledger idempotency key is already in use.' });
  }
}

function matches(record, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (['limit', 'offset'].includes(key)) return true;
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.includes(record[key]);
    return record[key] === value;
  });
}

function paginate(rows, filters = {}) {
  const offset = Number(filters.offset || 0);
  return [...rows].slice(offset, offset + Number(filters.limit || 50));
}

function ownerKey(line) {
  return line.owner_user_id || 'PLATFORM';
}

function signedAmount(line, account) {
  const amount = money(line.amount);
  const increases = line.direction === account.normal_balance;
  return increases ? amount : -amount;
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

/**
 * In-memory ledger store. It enforces the same invariants as the database:
 * journal lines balance, posted rows are immutable, financial keys are
 * unique, and balance buckets move only through journal postings.
 */
class LedgerInMemoryStore {
  constructor() {
    this.accounts = new Map();
    this.journals = new Map();
    this.journalLines = new Map();
    this.balances = new Map();
    this.expectations = new Map();
    this.settlements = new Map();
    this.auditEvents = new Map();
    assertRepository(this, LEDGER_STORE_METHODS, LedgerStoreToken);
  }

  ensureAccounts(inputs = []) {
    const now = new Date();
    for (const input of inputs) {
      const existing = [...this.accounts.values()].find((account) => account.code === input.code);
      if (existing) continue;
      const account = {
        id: input.id || randomUUID(),
        organization_id: input.organization_id ?? null,
        code: input.code,
        name: input.name,
        account_type: input.accountType,
        normal_balance: input.normalBalance,
        currency: input.currency || 'BDT',
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      this.accounts.set(account.id, account);
    }
    return Promise.resolve(this.listAccounts());
  }

  listAccounts(filters = {}) {
    const rows = [...this.accounts.values()].filter((account) => matches(account, filters));
    rows.sort((left, right) => left.code.localeCompare(right.code));
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  _account(code) {
    const account = [...this.accounts.values()].find((candidate) => candidate.code === code);
    if (!account) throw new NotFoundError({ message: `Ledger account '${code}' was not found.` });
    if (!account.is_active) {
      throw new DomainError({ message: `Ledger account '${code}' is inactive.` });
    }
    return account;
  }

  _applyBalance(line, account, currency, now) {
    const key = `${account.id}|${ownerKey(line)}|${line.bucket}|${currency}`;
    const existing = [...this.balances.values()].find((balance) => balance.key === key);
    const delta = signedAmount(line, account);
    if (existing) {
      existing.balance = balanceAmount(existing.balance + delta);
      existing.updated_at = now;
      return;
    }
    const balance = {
      id: randomUUID(),
      key,
      organization_id: line.organization_id ?? null,
      account_id: account.id,
      account_code: account.code,
      owner_key: ownerKey(line),
      owner_user_id: line.owner_user_id ?? null,
      bucket: line.bucket,
      currency,
      balance: balanceAmount(delta),
      updated_at: now,
    };
    this.balances.set(balance.id, balance);
  }

  postJournal(input) {
    const existing = [...this.journals.values()].find(
      (journal) => journal.idempotency_key === input.idempotency_key,
    );
    if (existing) {
      assertSameJournal(existing, input);
      return Promise.resolve(clone(existing));
    }

    assertBalanced(input.lines);
    const currency = input.currency || 'BDT';
    if (input.lines.some((line) => BALANCE_BUCKETS.includes(line.bucket) === false)) {
      throw new DomainError({ message: 'Invalid ledger balance bucket.' });
    }
    const resolvedLines = input.lines.map((line) => {
      const account = this._account(line.account_code);
      if (account.currency !== currency) {
        throw new DomainError({ message: 'Journal currency does not match its accounts.' });
      }
      return { line, account };
    });

    const now = new Date();
    const journal = {
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
      posted_at: now,
      created_at: now,
    };
    this.journals.set(journal.id, journal);

    for (const { line, account } of resolvedLines) {
      const entry = {
        id: randomUUID(),
        journal_id: journal.id,
        organization_id: journal.organization_id,
        account_id: account.id,
        account_code: account.code,
        direction: line.direction,
        bucket: line.bucket,
        amount: money(line.amount),
        currency,
        owner_user_id: line.owner_user_id ?? null,
        description: line.description ?? null,
        created_at: now,
      };
      this.journalLines.set(entry.id, entry);
      this._applyBalance(line, account, currency, now);
    }

    if (input.expectation_key) {
      this.matchExpectation({
        expectation_key: input.expectation_key,
        journal_id: journal.id,
      });
    }
    this.appendAudit({
      organization_id: journal.organization_id,
      action: 'ledger.journal.posted',
      actor_user_id: journal.actor_user_id,
      entityType: 'ledger_journal',
      entityId: journal.id,
      metadata: {
        idempotencyKey: journal.idempotency_key,
        referenceType: journal.reference_type,
        referenceId: journal.reference_id,
      },
      requestId: journal.request_id,
    });
    return Promise.resolve(clone(journal));
  }

  findJournalByIdempotency(idempotencyKey) {
    const journal = [...this.journals.values()].find(
      (candidate) => candidate.idempotency_key === idempotencyKey,
    );
    return Promise.resolve(clone(journal));
  }

  getJournal(journalId) {
    const journal = this.journals.get(journalId);
    if (!journal) throw new NotFoundError({ message: 'Ledger journal was not found.' });
    const lines = [...this.journalLines.values()]
      .filter((line) => line.journal_id === journal.id)
      .map(clone);
    return Promise.resolve({ ...clone(journal), lines });
  }

  listJournals(filters = {}) {
    const rows = [...this.journals.values()].filter((journal) => matches(journal, filters));
    rows.sort((left, right) => right.posted_at - left.posted_at);
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  _balanceKey({ account_code, owner_key, ownerKey, bucket, currency }) {
    const account = this._account(account_code);
    const owner = owner_key ?? ownerKey ?? 'PLATFORM';
    return `${account.id}|${owner}|${bucket}|${currency || account.currency}`;
  }

  getBalance(filters = {}) {
    const key = this._balanceKey(filters);
    const balance = [...this.balances.values()].find((candidate) => candidate.key === key);
    return Promise.resolve(balance ? clone(balance) : null);
  }

  listBalances(filters = {}) {
    const rows = [...this.balances.values()].filter((balance) => matches(balance, filters));
    rows.sort((left, right) => left.bucket.localeCompare(right.bucket));
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  recordExpectation(input) {
    const existing = [...this.expectations.values()].find(
      (expectation) => expectation.expectation_key === input.expectation_key,
    );
    if (existing) return Promise.resolve(clone(existing));
    const expectation = {
      id: randomUUID(),
      organization_id: input.organization_id ?? null,
      expectation_key: input.expectation_key,
      reference_type: input.reference_type,
      reference_id: input.reference_id ?? null,
      amount: money(input.amount),
      currency: input.currency || 'BDT',
      status: 'EXPECTED',
      journal_id: null,
      created_at: new Date(),
      matched_at: null,
    };
    this.expectations.set(expectation.id, expectation);
    return Promise.resolve(clone(expectation));
  }

  matchExpectation({ expectation_key, journal_id }) {
    const expectation = [...this.expectations.values()].find(
      (candidate) => candidate.expectation_key === expectation_key,
    );
    if (!expectation) return Promise.resolve(null);
    if (expectation.status !== 'MATCHED') {
      expectation.status = 'MATCHED';
      expectation.journal_id = journal_id;
      expectation.matched_at = new Date();
    }
    return Promise.resolve(clone(expectation));
  }

  listExpectations(filters = {}) {
    const rows = [...this.expectations.values()].filter((row) => matches(row, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  async createSettlement(input) {
    const duplicate = [...this.settlements.values()].find(
      (settlement) => settlement.idempotency_key === input.idempotency_key,
    );
    if (duplicate) throw new ConflictError({ message: 'Settlement idempotency key is in use.' });

    const now = new Date();
    const settlementId = input.id || randomUUID();
    // Post the journal before committing the settlement row. If the journal is
    // invalid the settlement must not survive, matching the Prisma transaction.
    const journal = await this.postJournal({
      ...input.journal,
      reference_type: 'SETTLEMENT',
      reference_id: settlementId,
      organization_id: input.organization_id ?? null,
      currency: input.currency || 'BDT',
    });
    const settlement = {
      id: settlementId,
      organization_id: input.organization_id ?? null,
      seller_user_id: input.seller_user_id,
      rule_key: input.rule_key ?? null,
      idempotency_key: input.idempotency_key,
      period_start: input.period_start,
      period_end: input.period_end,
      gross_amount: money(input.gross_amount),
      deductions_amount: money(input.deductions_amount),
      net_amount: money(input.net_amount),
      currency: input.currency || 'BDT',
      status: 'PAID',
      allocation_snapshot: clone(input.allocation_snapshot || {}),
      journal_id: journal.id,
      paid_at: now,
      created_at: now,
      updated_at: now,
    };
    this.settlements.set(settlement.id, settlement);

    this.appendAudit({
      organization_id: settlement.organization_id,
      action: 'ledger.settlement.recorded',
      actor_user_id: input.actor_user_id ?? null,
      entityType: 'ledger_settlement',
      entityId: settlement.id,
      metadata: { ruleKey: settlement.rule_key, netAmount: settlement.net_amount },
      requestId: input.request_id ?? null,
    });
    return Promise.resolve(clone(settlement));
  }

  listSettlements(filters = {}) {
    const rows = [...this.settlements.values()].filter((settlement) =>
      matches(settlement, filters),
    );
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, filters).map(clone));
  }

  appendAudit(input) {
    const entry = {
      id: randomUUID(),
      organization_id: input.organization_id ?? null,
      action: input.action,
      actor_user_id: input.actor_user_id ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: clone(input.metadata || {}),
      request_id: input.requestId ?? null,
      created_at: new Date(),
    };
    this.auditEvents.set(entry.id, entry);
    return Promise.resolve(clone(entry));
  }

  listAudit(filters = {}) {
    const rows = [...this.auditEvents.values()].filter((entry) => matches(entry, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    return Promise.resolve(paginate(rows, { ...filters, limit: filters.limit || 100 }).map(clone));
  }
}

module.exports = { LedgerInMemoryStore };
