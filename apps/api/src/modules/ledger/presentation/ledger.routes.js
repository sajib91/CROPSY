const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { LedgerServiceToken } = require('../application/ledger.service');
const { MODULE_ID } = require('../domain/ledger.entity');

const infoParamsSchema = z.object({ moduleId: z.string().trim().min(1) });
const journalParamsSchema = z.object({ journalId: z.string().uuid() });
const readLedger = Object.freeze({ auth: { permissions: ['ledger.read'] } });
const manageLedger = Object.freeze({ auth: { permissions: ['ledger.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

module.exports = async function ledgerRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(LedgerServiceToken);

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(infoParamsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), meta(request));
  });

  fastify.get('/accounts', { config: readLedger }, async (request) =>
    ok({ accounts: await service.accounts({ context: context(request) }) }, meta(request)),
  );

  fastify.get('/balances', { config: readLedger }, async (request) =>
    ok(
      { balances: await service.balances({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.get('/journals', { config: readLedger }, async (request) =>
    ok(
      { journals: await service.journals({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.get('/journals/:journalId', { config: readLedger }, async (request) => {
    const { journalId } = validate(journalParamsSchema, request.params, 'journal id');
    return ok(await service.journal({ context: context(request), journalId }), meta(request));
  });

  fastify.post('/journals', { config: manageLedger }, async (request, reply) => {
    const journal = await service.postJournal({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(journal, meta(request)));
  });

  fastify.post('/expectations', { config: manageLedger }, async (request, reply) => {
    const expectation = await service.createExpectation({
      context: context(request),
      input: request.body,
    });
    return reply.code(201).send(ok(expectation, meta(request)));
  });

  fastify.post('/settlements', { config: manageLedger }, async (request, reply) => {
    const settlement = await service.createSettlement({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(settlement, meta(request)));
  });

  fastify.get('/settlements', { config: readLedger }, async (request) =>
    ok(
      {
        settlements: await service.settlements({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.get('/audit', { config: readLedger }, async (request) =>
    ok(
      { events: await service.auditTrail({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.get('/reconciliation', { config: readLedger }, async (request) =>
    ok(
      {
        reconciliation: await service.reconciliation({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );
};
