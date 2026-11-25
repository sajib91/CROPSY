const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/agriculture.dto');
const { AgricultureServiceToken } = require('../application/agriculture.service');
const { MODULE_ID } = require('../domain/agriculture.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readCrops = Object.freeze({ auth: { permissions: ['crops.read'] } });
const manageCrops = Object.freeze({ auth: { permissions: ['crops.manage'] } });
const readCultivations = Object.freeze({ auth: { permissions: ['cultivations.read'] } });
const manageCultivations = Object.freeze({ auth: { permissions: ['cultivations.manage'] } });
const readHarvests = Object.freeze({ auth: { permissions: ['harvests.read'] } });
const manageHarvests = Object.freeze({ auth: { permissions: ['harvests.manage'] } });
const readExpenses = Object.freeze({ auth: { permissions: ['expenses.read'] } });
const manageExpenses = Object.freeze({ auth: { permissions: ['expenses.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function agricultureRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(AgricultureServiceToken);

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), meta(request));
  });

  // -------------------------------------------------------------------------
  // Crop catalog and varieties
  // -------------------------------------------------------------------------

  fastify.get('/crops', { config: readCrops }, async (request) =>
    ok({ crops: await service.listCrops({ query: request.query }) }, meta(request)),
  );

  fastify.post('/crops', { config: manageCrops }, async (request, reply) => {
    const crop = await service.createCrop({ input: request.body, request });
    return reply.code(201).send(ok(crop, meta(request)));
  });

  fastify.patch('/crops/:cropId', { config: manageCrops }, async (request) => {
    const { cropId } = validate(dto.cropParamsSchema, request.params, 'crop id');
    return ok(await service.updateCrop({ cropId, input: request.body, request }), meta(request));
  });

  fastify.get('/varieties', { config: readCrops }, async (request) =>
    ok({ varieties: await service.listVarieties({ query: request.query }) }, meta(request)),
  );

  fastify.post('/crops/:cropId/varieties', { config: manageCrops }, async (request, reply) => {
    const { cropId } = validate(dto.cropParamsSchema, request.params, 'crop id');
    const variety = await service.createVariety({
      cropId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(variety, meta(request)));
  });

  fastify.patch('/crops/:cropId/varieties/:varietyId', { config: manageCrops }, async (request) => {
    const { cropId, varietyId } = validate(
      dto.varietyParamsSchema,
      request.params,
      'variety identifiers',
    );
    return ok(
      await service.updateVariety({
        cropId,
        varietyId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  // -------------------------------------------------------------------------
  // Seasons, calendars, and agronomic recommendations
  // -------------------------------------------------------------------------

  fastify.get('/seasons', { config: readCrops }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      { seasons: await service.listSeasons({ context, query: request.query }) },
      meta(request),
    );
  });

  fastify.post('/seasons', { config: manageCrops }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const season = await service.createSeason({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(season, meta(request)));
  });

  fastify.patch('/seasons/:seasonId', { config: manageCrops }, async (request) => {
    const context = requireAuthenticated(request);
    const { seasonId } = validate(dto.seasonParamsSchema, request.params, 'season id');
    return ok(
      await service.updateSeason({
        context,
        seasonId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/calendars', { config: readCrops }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      { calendars: await service.listCalendars({ context, query: request.query }) },
      meta(request),
    );
  });

  fastify.post('/calendars', { config: manageCrops }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const calendar = await service.createCalendar({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(calendar, meta(request)));
  });

  fastify.patch('/calendars/:calendarId', { config: manageCrops }, async (request) => {
    const context = requireAuthenticated(request);
    const { calendarId } = validate(dto.calendarParamsSchema, request.params, 'calendar id');
    return ok(
      await service.updateCalendar({
        context,
        calendarId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/recommendations', { config: readCrops }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      {
        recommendations: await service.listRecommendations({
          context,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post('/recommendations', { config: manageCrops }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const recommendation = await service.createRecommendation({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(recommendation, meta(request)));
  });

  fastify.patch('/recommendations/:recommendationId', { config: manageCrops }, async (request) => {
    const context = requireAuthenticated(request);
    const { recommendationId } = validate(
      dto.recommendationParamsSchema,
      request.params,
      'recommendation id',
    );
    return ok(
      await service.updateRecommendation({
        context,
        recommendationId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  // -------------------------------------------------------------------------
  // Cultivations and activity history
  // -------------------------------------------------------------------------

  fastify.get('/cultivations', { config: readCultivations }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      {
        cultivations: await service.listCultivations({
          context,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post('/cultivations', { config: manageCultivations }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const cultivation = await service.createCultivation({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(cultivation, meta(request)));
  });

  fastify.get('/cultivations/:cultivationId', { config: readCultivations }, async (request) => {
    const context = requireAuthenticated(request);
    const { cultivationId } = validate(
      dto.cultivationParamsSchema,
      request.params,
      'cultivation id',
    );
    return ok(await service.getCultivation({ context, cultivationId }), meta(request));
  });

  fastify.patch('/cultivations/:cultivationId', { config: manageCultivations }, async (request) => {
    const context = requireAuthenticated(request);
    const { cultivationId } = validate(
      dto.cultivationParamsSchema,
      request.params,
      'cultivation id',
    );
    return ok(
      await service.updateCultivation({
        context,
        cultivationId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get(
    '/cultivations/:cultivationId/activities',
    { config: readCultivations },
    async (request) => {
      const context = requireAuthenticated(request);
      const { cultivationId } = validate(
        dto.cultivationParamsSchema,
        request.params,
        'cultivation id',
      );
      return ok(
        {
          activities: await service.listCultivationActivities({
            context,
            cultivationId,
            query: request.query,
          }),
        },
        meta(request),
      );
    },
  );

  fastify.post(
    '/cultivations/:cultivationId/activities',
    { config: manageCultivations },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { cultivationId } = validate(
        dto.cultivationParamsSchema,
        request.params,
        'cultivation id',
      );
      const activity = await service.createCultivationActivity({
        context,
        cultivationId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(activity, meta(request)));
    },
  );

  fastify.get('/farms/:farmId/activities', { config: readCultivations }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      {
        activities: await service.listFarmActivities({
          context,
          farmId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post(
    '/farms/:farmId/activities',
    { config: manageCultivations },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
      const activity = await service.createFarmActivity({
        context,
        farmId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(activity, meta(request)));
    },
  );

  // -------------------------------------------------------------------------
  // Harvests
  // -------------------------------------------------------------------------

  fastify.get(
    '/cultivations/:cultivationId/harvests',
    { config: readHarvests },
    async (request) => {
      const context = requireAuthenticated(request);
      const { cultivationId } = validate(
        dto.cultivationParamsSchema,
        request.params,
        'cultivation id',
      );
      return ok(
        {
          harvests: await service.listCultivationHarvests({
            context,
            cultivationId,
            query: request.query,
          }),
        },
        meta(request),
      );
    },
  );

  fastify.post(
    '/cultivations/:cultivationId/harvests',
    { config: manageHarvests },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { cultivationId } = validate(
        dto.cultivationParamsSchema,
        request.params,
        'cultivation id',
      );
      const harvest = await service.createHarvest({
        context,
        cultivationId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(harvest, meta(request)));
    },
  );

  fastify.get('/farms/:farmId/harvests', { config: readHarvests }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      {
        harvests: await service.listFarmHarvests({
          context,
          farmId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  // -------------------------------------------------------------------------
  // Expenses and production-cost reports
  // -------------------------------------------------------------------------

  fastify.get('/expenses', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      { expenses: await service.listExpenses({ context, query: request.query }) },
      meta(request),
    );
  });

  fastify.post('/expenses', { config: manageExpenses }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const expense = await service.createExpense({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(expense, meta(request)));
  });

  fastify.patch('/expenses/:expenseId', { config: manageExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { expenseId } = validate(dto.expenseParamsSchema, request.params, 'expense id');
    return ok(
      await service.updateExpense({
        context,
        expenseId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/expenses', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      {
        expenses: await service.listFarmExpenses({
          context,
          farmId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/reports/expenses', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.getFarmExpenseReport({
        context,
        farmId,
        query: request.query,
      }),
      meta(request),
    );
  });

  fastify.get(
    '/farms/:farmId/reports/production-cost',
    { config: readExpenses },
    async (request) => {
      const context = requireAuthenticated(request);
      const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
      return ok(
        await service.getProductionCost({
          context,
          farmId,
          query: request.query,
        }),
        meta(request),
      );
    },
  );

  fastify.get('/farms/:farmId/reports/yield-cost', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.getYieldCostComparison({
        context,
        farmId,
        query: request.query,
      }),
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/reports/profitability', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.getHarvestProfitability({
        context,
        farmId,
        query: request.query,
      }),
      meta(request),
    );
  });

  fastify.get('/cultivations/:cultivationId/cost', { config: readExpenses }, async (request) => {
    const context = requireAuthenticated(request);
    const { cultivationId } = validate(
      dto.cultivationParamsSchema,
      request.params,
      'cultivation id',
    );
    return ok(await service.getCultivationCost({ context, cultivationId }), meta(request));
  });
};
