const { z, isoDateTime } = require('@cropsy/validation');
const {
  AI_DEFAULT_LANGUAGE,
  AI_DEFAULT_TOP_K,
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
  marketObservationSchema,
  moduleInfoSchema,
  toModuleInfoDto,
};
