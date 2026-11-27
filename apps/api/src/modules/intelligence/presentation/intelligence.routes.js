const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/intelligence.entity');
const {
  aiAgenticApprovalSchema,
  aiAgenticRunSchema,
  aiAskSchema,
  aiBaselineSchema,
  aiChatSchema,
  aiComparisonSchema,
  aiConversationCreateSchema,
  aiEvaluationFeedbackSchema,
  aiEvaluationRunSchema,
  aiExpertReviewDecisionSchema,
  aiExpertReviewRequestSchema,
  aiFeedbackSchema,
  aiImageAnalysisSchema,
  aiImageFeedbackSchema,
  aiGraphBuildSchema,
  aiGraphContextSchema,
  aiGraphExtractionSchema,
  aiGraphRetrievalSchema,
  aiMarketExplanationSchema,
  aiMarketForecastSchema,
  aiMultimodalAssetSchema,
  aiMultimodalRetrieveSchema,
  aiRecommendSchema,
  aiRegressionSchema,
  aiRetrieveSchema,
  aiRetrievalEvaluationSchema,
  aiReviewParamsSchema,
  aiRunParamsSchema,
  aiUnifiedEvaluationSchema,
  aiUnifiedRunSchema,
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

  fastify.get('/ai/conversations', readAi, async (request) =>
    ok(await service.listAiConversations({ request }), meta(request)),
  );

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

  // -------------------------------------------------------------------------
  // Agentic RAG and GraphRAG. Approval and graph construction are
  // feedback-level operations because they can promote validated evidence;
  // retrieval and advisory generation remain read-only.
  // -------------------------------------------------------------------------

  fastify.post('/ai/agentic/run', readAi, async (request) => {
    const input = validate(aiAgenticRunSchema, request.body, 'AI agentic run request');
    return ok(await service.runAgenticAi({ input, request }), meta(request));
  });

  fastify.post('/ai/agentic/approve', feedbackAi, async (request) => {
    const input = validate(aiAgenticApprovalSchema, request.body, 'AI agentic approval request');
    return ok(await service.approveAgenticAi({ input, request }), meta(request));
  });

  fastify.post('/ai/graph/extract', readAi, async (request) => {
    const input = validate(aiGraphExtractionSchema, request.body, 'AI graph extraction request');
    return ok(await service.graphExtractAi({ input, request }), meta(request));
  });

  fastify.post('/ai/graph/build', feedbackAi, async (request) => {
    const input = validate(aiGraphBuildSchema, request.body, 'AI graph build request');
    return ok(await service.graphBuildAi({ input, request }), meta(request));
  });

  fastify.post('/ai/graph/retrieve', readAi, async (request) => {
    const input = validate(
      aiGraphRetrievalSchema,
      request.body ?? {},
      'AI graph retrieval request',
    );
    return ok(await service.graphRetrieveAi({ input, request }), meta(request));
  });

  fastify.post('/ai/graph/context', readAi, async (request) => {
    const input = validate(aiGraphContextSchema, request.body, 'AI graph context request');
    return ok(await service.graphContextAi({ input, request }), meta(request));
  });

  fastify.get('/ai/graph/capabilities', readAi, async (request) =>
    ok(await service.graphCapabilitiesAi({ request }), meta(request)),
  );

  // -------------------------------------------------------------------------
  // Multimodal RAG and unified orchestration. Uploads are advisory-only asset
  // indexing operations; every downstream answer preserves cited provenance.
  // -------------------------------------------------------------------------

  fastify.post('/ai/multimodal/assets', readAi, async (request) => {
    const input = validate(aiMultimodalAssetSchema, request.body, 'AI multimodal asset request');
    return ok(await service.ingestMultimodalAssetAi({ input, request }), meta(request));
  });

  fastify.post('/ai/multimodal/retrieve', readAi, async (request) => {
    const input = validate(
      aiMultimodalRetrieveSchema,
      request.body ?? {},
      'AI multimodal retrieval request',
    );
    return ok(await service.retrieveMultimodalAi({ input, request }), meta(request));
  });

  fastify.post('/ai/orchestration/run', readAi, async (request) => {
    const input = validate(aiUnifiedRunSchema, request.body, 'AI unified RAG request');
    return ok(await service.runUnifiedAi({ input, request }), meta(request));
  });

  fastify.get('/ai/orchestration/capabilities', readAi, async (request) =>
    ok(await service.unifiedCapabilitiesAi({ request }), meta(request)),
  );

  fastify.post('/ai/orchestration/evaluation', readAi, async (request) => {
    const input = validate(
      aiUnifiedEvaluationSchema,
      request.body ?? {},
      'AI unified evaluation request',
    );
    return ok(await service.evaluateUnifiedAi({ input, request }), meta(request));
  });

  // -------------------------------------------------------------------------
  // Advisory image analysis. Every result is an observation, never a confirmed
  // diagnosis, and never a hazardous chemical prescription.
  // -------------------------------------------------------------------------

  fastify.get('/ai/image-analysis/capabilities', readAi, async (request) =>
    ok(await service.imageAnalysisCapabilitiesAi({ request }), meta(request)),
  );

  fastify.post('/ai/image-analysis/analyze', readAi, async (request) => {
    const input = validate(aiImageAnalysisSchema, request.body, 'AI image analysis request');
    return ok(await service.analyzeImageAi({ input, request }), meta(request));
  });

  fastify.post('/ai/image-analysis/feedback', feedbackAi, async (request) => {
    const input = validate(aiImageFeedbackSchema, request.body, 'AI image feedback request');
    return ok(await service.submitImageFeedbackAi({ input, request }), meta(request));
  });

  fastify.post('/ai/image-analysis/reviews', feedbackAi, async (request) => {
    const input = validate(aiExpertReviewRequestSchema, request.body, 'AI expert review request');
    return ok(await service.requestExpertReviewAi({ input, request }), meta(request));
  });

  fastify.post('/ai/image-analysis/reviews/decide', feedbackAi, async (request) => {
    const input = validate(aiExpertReviewDecisionSchema, request.body, 'AI expert review decision');
    return ok(await service.decideExpertReviewAi({ input, request }), meta(request));
  });

  fastify.get('/ai/image-analysis/reviews/:reviewId', readAi, async (request) => {
    const params = validate(aiReviewParamsSchema, request.params, 'AI expert review id');
    return ok(await service.getExpertReviewAi({ ...params, request }), meta(request));
  });

  // -------------------------------------------------------------------------
  // Evaluation framework. Reports exist only after an actual evaluation run;
  // callers cannot supply scores, datasets, or callback implementations.
  // -------------------------------------------------------------------------

  fastify.get('/ai/evaluation/framework/capabilities', readAi, async (request) =>
    ok(await service.evaluationFrameworkCapabilitiesAi({ request }), meta(request)),
  );

  fastify.post('/ai/evaluation/framework/runs', readAi, async (request) => {
    const input = validate(aiEvaluationRunSchema, request.body ?? {}, 'AI evaluation run request');
    return ok(await service.runEvaluationAi({ input, request }), meta(request));
  });

  fastify.get('/ai/evaluation/framework/runs/:runId', readAi, async (request) => {
    const params = validate(aiRunParamsSchema, request.params, 'AI evaluation run id');
    return ok(await service.getEvaluationRunAi({ ...params, request }), meta(request));
  });

  fastify.post('/ai/evaluation/framework/feedback', feedbackAi, async (request) => {
    const input = validate(
      aiEvaluationFeedbackSchema,
      request.body,
      'AI evaluation feedback request',
    );
    return ok(await service.submitEvaluationFeedbackAi({ input, request }), meta(request));
  });

  fastify.post('/ai/evaluation/framework/baselines', feedbackAi, async (request) => {
    const input = validate(aiBaselineSchema, request.body, 'AI baseline request');
    return ok(await service.createRegressionBaselineAi({ input, request }), meta(request));
  });

  fastify.get('/ai/evaluation/framework/baselines', readAi, async (request) =>
    ok(await service.listRegressionBaselinesAi({ request }), meta(request)),
  );

  fastify.post('/ai/evaluation/framework/regression', readAi, async (request) => {
    const input = validate(aiRegressionSchema, request.body, 'AI regression check request');
    return ok(await service.checkRegressionAi({ input, request }), meta(request));
  });

  fastify.post('/ai/evaluation/framework/comparison', readAi, async (request) => {
    const input = validate(aiComparisonSchema, request.body, 'AI evaluation comparison request');
    return ok(await service.compareEvaluationsAi({ input, request }), meta(request));
  });

  fastify.get('/ai/evaluation/framework/diagnostics', readAi, async (request) =>
    ok(await service.retrievalDiagnosticsAi({ request }), meta(request)),
  );

  fastify.get('/ai/evaluation/framework/dashboards/failures', readAi, async (request) =>
    ok(await service.failureDashboardAi({ request }), meta(request)),
  );

  fastify.get('/ai/evaluation/framework/monitoring', readAi, async (request) =>
    ok(await service.agentMonitoringAi({ request }), meta(request)),
  );

  fastify.get('/ai/evaluation/framework/prompts', readAi, async (request) =>
    ok(await service.promptVersionsAi({ request }), meta(request)),
  );
};
