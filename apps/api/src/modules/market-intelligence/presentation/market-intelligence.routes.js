const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/market-intelligence.entity');
const {
  analysisQuerySchema,
  forecastQuerySchema,
  observationQuerySchema,
  trendQuerySchema,
} = require('../application/market-intelligence.dto');
const { MarketIntelligenceServiceToken } = require('../application/market-intelligence.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readMarket = Object.freeze({
  config: { auth: { anyPermissions: ['listings.read', 'ai.read'] } },
});

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function marketIntelligenceRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(MarketIntelligenceServiceToken);

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

  fastify.get('/observations', readMarket, async (request) => {
    const input = validate(observationQuerySchema, request.query, 'market observation query');
    return ok(await service.priceHistory({ input, request }), meta(request));
  });

  fastify.get('/prices/history', readMarket, async (request) => {
    const input = validate(observationQuerySchema, request.query, 'price history query');
    return ok(await service.priceHistory({ input, request }), meta(request));
  });

  fastify.get('/prices/regions', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'regional comparison query');
    return ok(await service.regionalComparison({ input, request }), meta(request));
  });

  fastify.get('/supply-demand', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'supply and demand query');
    return ok(await service.supplyDemand({ input, request }), meta(request));
  });

  fastify.get('/trends', readMarket, async (request) => {
    const input = validate(trendQuerySchema, request.query, 'price trend query');
    return ok(await service.trendVisualization({ input, request }), meta(request));
  });

  fastify.get('/seasonality', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'seasonal pattern query');
    return ok(await service.seasonalPatterns({ input, request }), meta(request));
  });

  fastify.get('/availability', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'availability query');
    return ok(await service.availability({ input, request }), meta(request));
  });

  fastify.get('/opportunities', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'market opportunity query');
    return ok(await service.opportunities({ input, request }), meta(request));
  });

  fastify.get('/selling-insights', readMarket, async (request) => {
    const input = validate(analysisQuerySchema, request.query, 'selling insight query');
    return ok(await service.sellingInsights({ input, request }), meta(request));
  });

  fastify.post('/forecast', readMarket, async (request) => {
    const input = validate(forecastQuerySchema, request.body ?? {}, 'market forecast request');
    return ok(await service.forecast({ input, request }), meta(request));
  });
};
