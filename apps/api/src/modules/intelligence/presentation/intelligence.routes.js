const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/intelligence.entity');
const {
  aiAskSchema,
  aiChatSchema,
  aiConversationCreateSchema,
  aiFeedbackSchema,
  aiMarketExplanationSchema,
  aiMarketForecastSchema,
  aiRecommendSchema,
  aiRetrieveSchema,
  aiRetrievalEvaluationSchema,
  aiWeatherAdvisorySchema,
  aiWeatherLookupSchema,
} = require('../application/intelligence.dto');
const { IntelligenceServiceToken } = require('../application/intelligence.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const conversationParamsSchema = z.object({
  conversationId: z.string().trim().min(1).max(128),
});

const readAi = Object.freeze({ config: { auth: { permissions: ['ai.read'] } } });
const feedbackAi = Object.freeze({ config: { auth: { permissions: ['ai.feedback'] } } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function intelligenceRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(IntelligenceServiceToken);

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
  // Authenticated AI service gateway. All outputs are advisory; no business
  // state is created, updated, or deleted from these routes.
  // -------------------------------------------------------------------------

  fastify.get('/ai/capabilities', readAi, async (request) =>
    ok(await service.describeAiCapabilities({ request }), meta(request)),
  );

  fastify.post('/ai/ask', readAi, async (request) => {
    const input = validate(aiAskSchema, request.body, 'AI ask request');
    return ok(await service.askAi({ input, request }), meta(request));
  });

  fastify.post('/ai/retrieve', readAi, async (request) => {
    const input = validate(aiRetrieveSchema, request.body, 'AI retrieve request');
    return ok(await service.retrieveAi({ input, request }), meta(request));
  });

  fastify.post('/ai/recommendations', readAi, async (request) => {
    const input = validate(aiRecommendSchema, request.body, 'AI recommendation request');
    return ok(await service.recommendAi({ input, request }), meta(request));
  });

  fastify.post('/ai/feedback', feedbackAi, async (request) => {
    const input = validate(aiFeedbackSchema, request.body, 'AI feedback request');
    return ok(await service.submitAiFeedback({ input, request }), meta(request));
  });

  fastify.post('/ai/chat', readAi, async (request) => {
    const input = validate(aiChatSchema, request.body, 'AI chat request');
    return ok(await service.chatAi({ input, request }), meta(request));
  });

  fastify.post('/ai/conversations', readAi, async (request) => {
    const input = validate(
      aiConversationCreateSchema,
      request.body ?? {},
      'AI conversation request',
    );
    return ok(await service.createAiConversation({ input, request }), meta(request));
  });

  fastify.get('/ai/conversations/:conversationId', readAi, async (request) => {
    const { conversationId } = validate(
      conversationParamsSchema,
      request.params,
      'AI conversation id',
    );
    return ok(await service.getAiConversation({ conversationId }, request), meta(request));
  });

  fastify.post('/ai/evaluation/retrieval', readAi, async (request) => {
    const input = validate(
      aiRetrievalEvaluationSchema,
      request.body ?? {},
      'AI retrieval evaluation request',
    );
    return ok(await service.evaluateRetrievalAi({ input, request }), meta(request));
  });

  // -------------------------------------------------------------------------
  // Market and weather intelligence. Explanations and advisories remain
  // advisory; observations and model outputs are explicitly separated.
  // -------------------------------------------------------------------------

  fastify.post('/ai/market/forecast', readAi, async (request) => {
    const input = validate(aiMarketForecastSchema, request.body, 'AI market forecast request');
    return ok(await service.forecastMarketAi({ input, request }), meta(request));
  });

  fastify.post('/ai/market/explain', readAi, async (request) => {
    const input = validate(
      aiMarketExplanationSchema,
      request.body,
      'AI market explanation request',
    );
    return ok(await service.explainMarketAi({ input, request }), meta(request));
  });

  fastify.post('/ai/weather/observations', readAi, async (request) => {
    const input = validate(aiWeatherLookupSchema, request.body, 'AI weather observation request');
    return ok(await service.getWeatherObservationsAi({ input, request }), meta(request));
  });

  fastify.post('/ai/weather/forecasts', readAi, async (request) => {
    const input = validate(aiWeatherLookupSchema, request.body, 'AI weather forecast request');
    return ok(await service.getWeatherForecastsAi({ input, request }), meta(request));
  });

  fastify.post('/ai/weather/alerts', readAi, async (request) => {
    const input = validate(aiWeatherLookupSchema, request.body, 'AI weather alert request');
    return ok(await service.getWeatherAlertsAi({ input, request }), meta(request));
  });

  fastify.post('/ai/weather/advisory', readAi, async (request) => {
    const input = validate(aiWeatherAdvisorySchema, request.body, 'AI weather advisory request');
    return ok(await service.getWeatherAdvisoryAi({ input, request }), meta(request));
  });
};
