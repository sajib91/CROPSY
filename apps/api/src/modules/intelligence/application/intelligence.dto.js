const { z, isoDateTime } = require('@cropsy/validation');
const {
  AI_DEFAULT_LANGUAGE,
  AI_DEFAULT_TOP_K,
  AI_DOCUMENT_TYPES,
  AI_GRAPH_ENTITY_TYPES,
  AI_GRAPH_PREDICATES,
  AI_LANGUAGES,
  AI_RECOMMENDATION_TYPES,
  AI_TOP_K_MAX,
  AI_TOP_K_MIN,
} = require('../domain/ai-gateway.entity');

const nonEmptyString = z.string().trim().min(1);
const aiLanguageSchema = z.enum(AI_LANGUAGES).default(AI_DEFAULT_LANGUAGE);
const aiTopKSchema = z.number().int().min(AI_TOP_K_MIN).max(AI_TOP_K_MAX).default(AI_DEFAULT_TOP_K);

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  status: nonEmptyString,
  path: nonEmptyString,
  dependsOn: z.array(nonEmptyString),
  publishes: z.array(nonEmptyString),
  subscribes: z.array(nonEmptyString),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const aiAskSchema = z.object({
  question: nonEmptyString.max(4000),
  language: aiLanguageSchema,
  context: z.string().trim().max(4000).optional(),
  topK: aiTopKSchema,
  modelKey: nonEmptyString.max(100).optional(),
});

const aiChatSchema = z.object({
  message: nonEmptyString.max(4000),
  language: aiLanguageSchema,
  conversationId: nonEmptyString.max(128).optional(),
  topK: aiTopKSchema,
  modelKey: nonEmptyString.max(100).optional(),
  region: z.string().trim().max(200).optional(),
  documentTypes: z.array(nonEmptyString.max(64)).max(20).optional(),
  maxHistoryTurns: z.number().int().min(1).max(50).default(8),
  includeHistory: z.boolean().default(true),
});

const aiConversationCreateSchema = z.object({
  language: aiLanguageSchema,
  title: z.string().trim().max(300).optional(),
});

const aiRetrievalEvaluationSchema = z.object({
  topK: aiTopKSchema,
});

const aiRetrieveSchema = z.object({
  query: nonEmptyString.max(4000),
  language: aiLanguageSchema,
  topK: aiTopKSchema,
  documentTypes: z.array(nonEmptyString.max(64)).max(20).optional(),
  languages: z
    .array(z.enum(['en', 'bn']))
    .max(3)
    .optional(),
  sources: z.array(nonEmptyString.max(300)).max(20).optional(),
  publishers: z.array(nonEmptyString.max(300)).max(20).optional(),
  jurisdictions: z.array(nonEmptyString.max(200)).max(20).optional(),
  authorities: z.array(nonEmptyString.max(200)).max(20).optional(),
  region: z.string().trim().max(200).optional(),
  fetchK: z.number().int().min(1).max(200).optional(),
  fusionMethod: z.enum(['weighted', 'rrf']).optional(),
  vectorWeight: z.number().min(0).max(1).optional(),
  keywordWeight: z.number().min(0).max(1).optional(),
  rrfK: z.number().int().min(1).max(500).optional(),
  enableQueryExpansion: z.boolean().optional(),
  maxQueryVariants: z.number().int().min(1).max(8).optional(),
  deduplicationThreshold: z.number().min(0.5).max(1).optional(),
  maxChunksPerDocument: z.number().int().min(1).max(20).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

const aiRecommendSchema = z.object({
  recommendationType: z.enum(AI_RECOMMENDATION_TYPES),
  language: aiLanguageSchema,
  crop: nonEmptyString.max(200).optional(),
  region: nonEmptyString.max(200).optional(),
  season: nonEmptyString.max(100).optional(),
  soil: nonEmptyString.max(200).optional(),
  question: nonEmptyString.max(4000).optional(),
  topK: aiTopKSchema,
  modelKey: nonEmptyString.max(100).optional(),
});

const aiFeedbackSchema = z.object({
  traceId: nonEmptyString.max(128),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

const observationTime = z.string().trim().min(1).max(50);
const marketObservationSchema = z
  .object({
    observationId: nonEmptyString.max(180),
    productId: nonEmptyString.max(128),
    listingId: nonEmptyString.max(128).nullable().optional(),
    price: z.number().finite().gt(0).max(1e12),
    currency: nonEmptyString.max(3),
    observedAt: observationTime,
    region: z.string().trim().max(200).default(''),
    status: z.string().trim().max(64).nullable().optional(),
    quantityAvailable: z.number().finite().min(0).max(1e12).nullable().optional(),
    harvestDate: z.string().trim().max(20).nullable().optional(),
    favoriteCount: z.number().int().min(0).max(1000000).default(0),
    demandSignal: z.string().trim().max(64).nullable().optional(),
    source: nonEmptyString.max(300),
    sourceReference: nonEmptyString.max(300),
    sourceUrl: z.string().trim().max(1000).default(''),
    collectionMethod: nonEmptyString.max(120),
    evidenceClass: z.literal('historical_observation'),
  })
  .strict();

const aiMarketForecastSchema = z
  .object({
    observations: z.array(marketObservationSchema).min(1).max(500),
    productId: nonEmptyString.max(128).optional(),
    region: z.string().trim().max(200).optional(),
    horizon: z.number().int().min(1).max(12).optional(),
    model: z.enum(['moving_average', 'seasonal_naive', 'linear_trend']).optional(),
    seasonLength: z.number().int().min(1).max(24).optional(),
    language: aiLanguageSchema,
    includeExplanation: z.boolean().default(false),
  })
  .strict();

const aiMarketExplanationSchema = z
  .object({
    productId: nonEmptyString.max(128).optional(),
    region: z.string().trim().max(200).optional(),
    language: aiLanguageSchema,
    observations: z.array(marketObservationSchema).min(1).max(500),
    statisticalEstimates: z.record(z.number().finite()),
    predictions: z
      .array(
        z.object({
          forecastFor: observationTime,
          predictedPrice: z.number().finite().gt(0),
          model: nonEmptyString.max(120),
        }),
      )
      .max(12)
      .default([]),
    evaluation: z.record(z.unknown()).default({}),
  })
  .strict();

const coordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

const aiWeatherLookupSchema = z
  .object({
    farmId: nonEmptyString.max(128),
    coordinates: coordinatesSchema.optional(),
    region: z.string().trim().max(300).optional(),
    from: observationTime.optional(),
    to: observationTime.optional(),
    language: aiLanguageSchema,
  })
  .strict();

const aiWeatherAdvisorySchema = aiWeatherLookupSchema.extend({
  crop: z.string().trim().max(200).default(''),
  cropStage: z.string().trim().max(100).default(''),
  cultivationId: nonEmptyString.max(128).optional(),
  includeHistory: z.boolean().default(true),
  includeForecast: z.boolean().default(true),
  includeAlerts: z.boolean().default(true),
  modelKey: nonEmptyString.max(100).optional(),
});

// Agentic RAG and GraphRAG request bodies are deliberately strict: they never
// accept farmer/organization identifiers or business record identifiers. The
// trusted organization comes from the authenticated gateway metadata only.
// Reviewer identity is populated by the AI service from signed internal
// context; callers may never assert who approved a pending candidate.
const aiGraphApprovalSchema = z
  .object({
    approvalId: nonEmptyString.max(128),
    decision: z.enum(['approved', 'rejected']),
    scope: z.array(nonEmptyString.max(300)).max(100).default([]),
    approvedAt: z.string().trim().max(50).default(''),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();

const aiAgenticRunSchema = z
  .object({
    query: nonEmptyString.max(4000),
    language: aiLanguageSchema,
    topK: aiTopKSchema,
    documentTypes: z.array(nonEmptyString.max(64)).max(20).default([]),
    region: z.string().trim().max(200).default(''),
    includeGlobal: z.boolean().default(true),
    useGraph: z.boolean().default(true),
    requireApproval: z.boolean().default(false),
    documentText: z.string().trim().max(30000).default(''),
    marketObservations: z.array(marketObservationSchema).max(100).default([]),
    modelKey: nonEmptyString.max(100).optional(),
  })
  .strict();

const aiAgenticApprovalSchema = z
  .object({
    traceId: nonEmptyString.max(128),
    approval: aiGraphApprovalSchema,
  })
  .strict();

// Verification assertions are never accepted: graph evidence classes are
// derived only from server-side state.
const aiGraphExtractionSchema = z
  .object({
    text: nonEmptyString.max(30000),
    source: nonEmptyString.max(200),
    sourceReference: nonEmptyString.max(300),
    sourceUrl: z.string().trim().max(1000).default(''),
    documentId: z.string().trim().max(128).default(''),
    chunkId: z.string().trim().max(128).default(''),
    modelKey: nonEmptyString.max(100).optional(),
    entityTypes: z.array(z.enum(AI_GRAPH_ENTITY_TYPES)).max(12).default([]),
    relationTypes: z.array(z.enum(AI_GRAPH_PREDICATES)).max(9).default([]),
  })
  .strict();

const aiGraphBuildSchema = z
  .object({
    extraction: aiGraphExtractionSchema,
  })
  .strict();

const aiGraphTopKSchema = z.number().int().min(1).max(100).default(20);

const aiGraphRetrievalSchema = z
  .object({
    query: z.string().trim().max(4000).default(''),
    entities: z.array(nonEmptyString.max(300)).max(20).default([]),
    includeGlobal: z.boolean().default(true),
    topK: aiGraphTopKSchema,
    maxHops: z.number().int().min(1).max(6).default(2),
    minConfidence: z.number().min(0).max(1).default(0.6),
    verifiedOnly: z.boolean().default(false),
    includeCommunities: z.boolean().default(true),
    includeCandidates: z.boolean().default(false),
    predicates: z.array(z.enum(AI_GRAPH_PREDICATES)).max(9).default([]),
  })
  .strict();

const aiGraphContextSchema = z
  .object({
    query: nonEmptyString.max(4000),
    graph: aiGraphRetrievalSchema,
    topK: aiTopKSchema,
    documentTypes: z.array(nonEmptyString.max(64)).max(20).default([]),
  })
  .strict();

// Multimodal RAG and unified orchestration bodies are strict. Authenticated
// organization/user context travels only in signed internal headers.
// Provenance authority, jurisdiction, and verification are asserted only by
// trusted server-side registries. Callers may describe a source but may not
// claim that it is authoritative or licensed.
const aiSourceMetadataSchema = z
  .object({
    name: nonEmptyString.max(300),
    url: z.string().trim().max(1000).default(''),
    publisher: z.string().trim().max(300).default(''),
    publishedAt: z.string().trim().max(50).default(''),
    authors: z.array(nonEmptyString.max(300)).max(50).default([]),
  })
  .strict();

const aiLicenseMetadataSchema = z
  .object({
    code: nonEmptyString.max(100),
    url: nonEmptyString.max(1000),
    attributionRequired: z.boolean().default(false),
  })
  .strict();

const aiMultimodalAssetSchema = z
  .object({
    assetId: nonEmptyString.max(128),
    title: nonEmptyString.max(500),
    filename: z.string().trim().max(300).default(''),
    mimeType: nonEmptyString.max(150),
    documentType: z.enum(AI_DOCUMENT_TYPES).default('other'),
    language: aiLanguageSchema,
    version: nonEmptyString.max(100).default('v1'),
    source: aiSourceMetadataSchema,
    license: aiLicenseMetadataSchema,
    sourceVersion: z.string().trim().max(100).default(''),
    text: z.string().trim().max(20_000_000).default(''),
    contentBase64: z.string().trim().max(30_000_000).default(''),
    visualQuestion: z.string().trim().max(2000).default(''),
    isPlantImage: z.boolean().default(false),
  })
  .strict();

const aiMultimodalRetrieveSchema = z
  .object({
    query: z.string().trim().max(8000).default(''),
    language: aiLanguageSchema,
    topK: z.number().int().min(1).max(50).default(5),
    assetIds: z.array(nonEmptyString.max(128)).max(50).default([]),
    mimeTypes: z.array(nonEmptyString.max(150)).max(20).default([]),
    imageBase64: z.string().trim().max(30_000_000).default(''),
    includeVisualSimilarity: z.boolean().default(true),
  })
  .strict();

const aiUnifiedRunSchema = z
  .object({
    query: nonEmptyString.max(8000),
    language: aiLanguageSchema,
    topK: aiTopKSchema,
    documentTypes: z.array(nonEmptyString.max(64)).max(20).default([]),
    region: z.string().trim().max(200).default(''),
    assetIds: z.array(nonEmptyString.max(128)).max(50).default([]),
    imageBase64: z.string().trim().max(30_000_000).default(''),
    documentText: z.string().trim().max(30000).default(''),
    useGraph: z.boolean().default(true),
    includeGlobal: z.boolean().default(true),
    requireApproval: z.boolean().default(false),
    modelKey: nonEmptyString.max(100).optional(),
  })
  .strict();

const aiUnifiedEvaluationSchema = z
  .object({
    dataset: z.enum(['text', 'image', 'multimodal']),
    topK: aiTopKSchema,
  })
  .strict();

// Advisory image analysis and the evaluation framework use strict DTOs.
// Organization, farmer, and business record identifiers are never accepted
// from callers; trusted identity travels only in signed gateway headers.
const aiImageAnalysisSchema = z
  .object({
    subjectType: z.enum(['crop', 'leaf', 'fruit', 'plant']),
    analysisKind: z.enum(['general', 'disease', 'pest', 'nutrient']).default('general'),
    language: aiLanguageSchema,
    contentBase64: z.string().trim().min(1).max(30_000_000),
    mimeType: z.string().trim().max(150).default(''),
    filename: z.string().trim().max(300).default(''),
    crop: z.string().trim().max(200).default(''),
    region: z.string().trim().max(200).default(''),
    question: z.string().trim().max(2000).default(''),
    includeReferences: z.boolean().default(true),
    assetIds: z.array(nonEmptyString.max(128)).max(50).default([]),
    modelKey: nonEmptyString.max(100).optional(),
    promptVersion: nonEmptyString.max(100).optional(),
  })
  .strict();

const aiImageFeedbackSchema = z
  .object({
    analysisId: nonEmptyString.max(128),
    traceId: z.string().trim().max(128).default(''),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).default(''),
    labels: z.array(nonEmptyString.max(100)).max(20).default([]),
    correctionLabel: z.string().trim().max(300).default(''),
  })
  .strict();

const aiExpertReviewRequestSchema = z
  .object({
    analysisId: nonEmptyString.max(128),
    notes: z.string().trim().max(2000).default(''),
    priority: z.enum(['routine', 'urgent']).default('routine'),
  })
  .strict();

const aiExpertReviewDecisionSchema = z
  .object({
    reviewId: nonEmptyString.max(128),
    decision: z.enum(['approved', 'rejected', 'needs_followup']),
    reviewer: nonEmptyString.max(200),
    notes: z.string().trim().max(2000).default(''),
  })
  .strict();

const aiEvaluationRunSchema = z
  .object({
    suite: z
      .enum([
        'all',
        'retrieval',
        'answer_relevance',
        'factual_correctness',
        'citation_correctness',
        'groundedness',
        'language_quality',
        'multimodal_retrieval',
        'agent_reliability',
        'performance',
      ])
      .default('all'),
    modelVersions: z.record(nonEmptyString.max(200)).default({}),
    promptVersions: z.record(nonEmptyString.max(200)).default({}),
  })
  .strict();

const aiEvaluationFeedbackSchema = z
  .object({
    traceId: nonEmptyString.max(128),
    rating: z.number().int().min(1).max(5),
    labels: z.array(nonEmptyString.max(100)).max(20).default([]),
    comment: z.string().trim().max(2000).default(''),
    caseId: z.string().trim().max(128).default(''),
    runId: z.string().trim().max(128).default(''),
    task: nonEmptyString.max(100).default('general'),
  })
  .strict();

const aiBaselineSchema = z
  .object({
    runId: nonEmptyString.max(128),
  })
  .strict();

const aiRegressionSchema = aiBaselineSchema.extend({
  baselineId: nonEmptyString.max(128),
  tolerance: z.number().min(0).max(1).default(0.02),
});

const aiComparisonSchema = z
  .object({
    runIds: z.array(nonEmptyString.max(128)).min(2).max(10),
  })
  .strict();

const aiReviewParamsSchema = z.object({ reviewId: nonEmptyString.max(128) });
const aiRunParamsSchema = z.object({ runId: nonEmptyString.max(128) });

function toModuleInfoDto(entity, metadata) {
  return {
    id: entity.id,
    moduleId: metadata.id,
    name: metadata.name,
    description: metadata.description,
    status: entity.status,
    path: metadata.path,
    dependsOn: [...metadata.dependsOn],
    publishes: [...metadata.publishes],
    subscribes: [...metadata.subscribes],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

module.exports = {
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
  aiGraphApprovalSchema,
  aiGraphBuildSchema,
  aiGraphContextSchema,
  aiGraphExtractionSchema,
  aiGraphRetrievalSchema,
  aiMarketExplanationSchema,
  aiMarketForecastSchema,
  aiLicenseMetadataSchema,
  aiMultimodalAssetSchema,
  aiMultimodalRetrieveSchema,
  aiRecommendSchema,
  aiRegressionSchema,
  aiRetrieveSchema,
  aiRetrievalEvaluationSchema,
  aiReviewParamsSchema,
  aiRunParamsSchema,
  aiSourceMetadataSchema,
  aiUnifiedEvaluationSchema,
  aiUnifiedRunSchema,
  aiWeatherAdvisorySchema,
  aiWeatherLookupSchema,
  marketObservationSchema,
  moduleInfoSchema,
  toModuleInfoDto,
};
