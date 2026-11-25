const { isoDateTime, z } = require('@cropsy/validation');

const {
  CALENDAR_SCOPES,
  CROP_CATEGORIES,
  CULTIVATION_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_SOURCES,
  FARM_ACTIVITY_TYPES,
  GROWTH_STAGES,
  HARVEST_STATUSES,
  OBSERVATION_ACTIVITY_TYPES,
  OBSERVATION_SEVERITIES,
  RECOMMENDATION_SOURCES,
} = require('../domain/agriculture.entity');

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const positiveNumber = z.number().min(0.001).max(1e12);
const nonNegativeNumber = z.number().min(0).max(1e12);
const month = z.number().int().min(1).max(12);
const currency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code.');
const confidence = z.number().min(0).max(1);
const nullableText = (schema = shortText, max = 180) =>
  schema.trim().max(max).nullable().optional();

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: nonEmpty(),
  name: nonEmpty(),
  description: nonEmpty(),
  status: nonEmpty(),
  path: nonEmpty(),
  dependsOn: z.array(nonEmpty()),
  publishes: z.array(nonEmpty()),
  subscribes: z.array(nonEmpty()),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

function nonEmpty() {
  return z.string().trim().min(1);
}

const cropCategorySchema = z.enum(CROP_CATEGORIES);
const cultivationStatusSchema = z.enum(CULTIVATION_STATUSES);
const activityTypeSchema = z.enum(FARM_ACTIVITY_TYPES);
const growthStageSchema = z.enum(GROWTH_STAGES);
const observationSeveritySchema = z.enum(OBSERVATION_SEVERITIES);
const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
const expenseSourceSchema = z.enum(EXPENSE_SOURCES);
const recommendationSourceSchema = z.enum(RECOMMENDATION_SOURCES);
const calendarScopeSchema = z.enum(CALENDAR_SCOPES);
const harvestStatusSchema = z.enum(HARVEST_STATUSES);

const cropCreateSchema = z
  .object({
    code,
    name: shortText,
    nameBn: nullableText(),
    category: cropCategorySchema.default('OTHER'),
    isActive: z.boolean().default(true),
  })
  .strict();

const cropUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    category: cropCategorySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const varietyCreateSchema = z
  .object({
    code,
    name: shortText,
    nameBn: nullableText(),
    maturityDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict();

const varietyUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    maturityDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict();

const seasonCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    code,
    name: shortText,
    nameBn: nullableText(),
    startMonth: month,
    endMonth: month,
    year: z.number().int().min(1900).max(2200).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const seasonUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    startMonth: month.optional(),
    endMonth: month.optional(),
    year: z.number().int().min(1900).max(2200).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const calendarCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    scope: calendarScopeSchema.default('GLOBAL'),
    cropId: uuid,
    cropVarietyId: uuid.nullable().optional(),
    code,
    name: shortText,
    sowingStartMonth: month,
    sowingEndMonth: month,
    harvestDaysMin: z.number().int().min(1).max(3650).nullable().optional(),
    harvestDaysMax: z.number().int().min(1).max(3650).nullable().optional(),
    isActive: z.boolean().default(true),
    notes: nullableText(longText, 4000),
  })
  .strict()
  .refine(
    (value) =>
      (value.harvestDaysMin == null && value.harvestDaysMax == null) ||
      (value.harvestDaysMin != null &&
        value.harvestDaysMax != null &&
        value.harvestDaysMin <= value.harvestDaysMax),
    { message: 'Harvest days must be provided as a valid min/max pair.', path: ['harvestDaysMax'] },
  );

const calendarUpdateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    scope: calendarScopeSchema.optional(),
    cropVarietyId: uuid.nullable().optional(),
    name: shortText.optional(),
    sowingStartMonth: month.optional(),
    sowingEndMonth: month.optional(),
    harvestDaysMin: z.number().int().min(1).max(3650).nullable().optional(),
    harvestDaysMax: z.number().int().min(1).max(3650).nullable().optional(),
    isActive: z.boolean().optional(),
    notes: nullableText(longText, 4000),
  })
  .strict();

const recommendationCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    scope: calendarScopeSchema.default('GLOBAL'),
    cropId: uuid,
    cropVarietyId: uuid.nullable().optional(),
    calendarId: uuid.nullable().optional(),
    code,
    title: shortText,
    body: z.string().trim().min(1).max(4000),
    source: recommendationSourceSchema.default('CONFIGURED'),
    confidence: confidence.nullable().optional(),
    ruleKey: nullableText(shortText, 120),
    validFrom: isoDateTime.nullable().optional(),
    validUntil: isoDateTime.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'AI_ESTIMATED' && !value.ruleKey?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ruleKey'],
        message: 'AI-estimated recommendations require a rule key.',
      });
    }
    if (
      value.validFrom &&
      value.validUntil &&
      new Date(value.validUntil).getTime() < new Date(value.validFrom).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'validUntil must not be earlier than validFrom.',
      });
    }
  });

const recommendationUpdateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    scope: calendarScopeSchema.optional(),
    cropVarietyId: uuid.nullable().optional(),
    calendarId: uuid.nullable().optional(),
    title: shortText.optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    source: recommendationSourceSchema.optional(),
    confidence: confidence.nullable().optional(),
    ruleKey: nullableText(shortText, 120),
    validFrom: isoDateTime.nullable().optional(),
    validUntil: isoDateTime.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const cultivationCreateSchema = z
  .object({
    farmId: uuid,
    organizationId: uuid.nullable().optional(),
    cropVarietyId: uuid,
    cropSeasonId: uuid.nullable().optional(),
    cropCalendarId: uuid.nullable().optional(),
    landParcelId: uuid.nullable().optional(),
    code: code.optional(),
    status: cultivationStatusSchema.default('PLANNED'),
    sownAt: isoDateTime.nullable().optional(),
    plantedAt: isoDateTime.nullable().optional(),
    expectedHarvestAt: isoDateTime.nullable().optional(),
    areaHectares: positiveNumber,
    expectedYieldKg: nonNegativeNumber.nullable().optional(),
    growthStage: growthStageSchema.default('NOT_SET'),
    notes: nullableText(longText, 4000),
  })
  .strict()
  .refine((value) => assertCultivationDates(value), {
    message: 'Cultivation dates must be in chronological order.',
    path: ['expectedHarvestAt'],
  });

const cultivationUpdateSchema = z
  .object({
    cropSeasonId: uuid.nullable().optional(),
    cropCalendarId: uuid.nullable().optional(),
    landParcelId: uuid.nullable().optional(),
    code: code.optional(),
    status: cultivationStatusSchema.optional(),
    sownAt: isoDateTime.nullable().optional(),
    plantedAt: isoDateTime.nullable().optional(),
    expectedHarvestAt: isoDateTime.nullable().optional(),
    harvestedAt: isoDateTime.nullable().optional(),
    areaHectares: positiveNumber.optional(),
    expectedYieldKg: nonNegativeNumber.nullable().optional(),
    growthStage: growthStageSchema.optional(),
    notes: nullableText(longText, 4000),
  })
  .strict();

const activityCreateSchema = z
  .object({
    farmId: uuid,
    organizationId: uuid.nullable().optional(),
    cultivationId: uuid.nullable().optional(),
    landParcelId: uuid.nullable().optional(),
    inputId: uuid.nullable().optional(),
    performedByUserId: uuid.nullable().optional(),
    activityType: activityTypeSchema,
    activityDate: isoDateTime,
    growthStage: growthStageSchema.default('NOT_SET'),
    observationSeverity: observationSeveritySchema.nullable().optional(),
    quantity: positiveNumber.nullable().optional(),
    unitCode: nullableText(shortText, 16),
    costAmount: nonNegativeNumber.nullable().optional(),
    currency: currency.default('BDT'),
    notes: nullableText(longText, 4000),
  })
  .strict()
  .superRefine((value, context) => {
    if (OBSERVATION_ACTIVITY_TYPES.includes(value.activityType) && !value.observationSeverity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observationSeverity'],
        message: 'Disease and pest observations require a severity.',
      });
    }
    if (value.activityType === 'GROWTH_STAGE' && value.growthStage === 'NOT_SET') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['growthStage'],
        message: 'Growth-stage activities require a specific stage.',
      });
    }
  });

const harvestCreateSchema = z
  .object({
    farmId: uuid,
    organizationId: uuid.nullable().optional(),
    cultivationId: uuid,
    harvestedAt: isoDateTime,
    quantityKg: positiveNumber,
    qualityGrade: nullableText(shortText, 32),
    status: harvestStatusSchema.default('DRAFT'),
  })
  .strict();

const expenseCreateSchema = z
  .object({
    farmId: uuid,
    organizationId: uuid.nullable().optional(),
    cultivationId: uuid.nullable().optional(),
    category: expenseCategorySchema,
    source: expenseSourceSchema.default('RECORDED'),
    expenseDate: isoDateTime,
    amount: positiveNumber,
    currency: currency.default('BDT'),
    description: nullableText(shortText, 255),
    quantity: positiveNumber.nullable().optional(),
    unitCode: nullableText(shortText, 16),
    receiptUrl: nullableText(shortText, 512),
    receiptNote: nullableText(longText, 4000),
    estimateRuleKey: nullableText(shortText, 120),
    confidence: confidence.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'AI_ESTIMATED' && !value.estimateRuleKey?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['estimateRuleKey'],
        message: 'AI-estimated expenses require an estimate rule key.',
      });
    }
    if (
      value.source === 'RECORDED' &&
      (value.estimateRuleKey != null || value.confidence != null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: 'Recorded expenses cannot carry AI estimate metadata.',
      });
    }
  });

const expenseUpdateSchema = z
  .object({
    category: expenseCategorySchema.optional(),
    source: expenseSourceSchema.optional(),
    expenseDate: isoDateTime.optional(),
    amount: positiveNumber.optional(),
    currency: currency.optional(),
    description: nullableText(shortText, 255),
    quantity: positiveNumber.nullable().optional(),
    unitCode: nullableText(shortText, 16),
    receiptUrl: nullableText(shortText, 512),
    receiptNote: nullableText(longText, 4000),
    estimateRuleKey: nullableText(shortText, 120),
    confidence: confidence.nullable().optional(),
  })
  .strict();

const cropQuerySchema = z
  .object({
    category: cropCategorySchema.optional(),
    includeInactive: booleanQuery.default(false),
  })
  .strict();

const varietyQuerySchema = z.object({ cropId: uuid.optional() }).strict();

const scopedQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
  })
  .strict();

const calendarQuerySchema = scopedQuerySchema.extend({
  cropId: uuid.optional(),
  cropVarietyId: uuid.optional(),
  isActive: booleanQuery.optional(),
});

const recommendationQuerySchema = scopedQuerySchema.extend({
  cropId: uuid.optional(),
  cropVarietyId: uuid.optional(),
  source: recommendationSourceSchema.optional(),
  isActive: booleanQuery.optional(),
});

const seasonQuerySchema = scopedQuerySchema.extend({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  isActive: booleanQuery.optional(),
});

const cultivationQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    farmId: uuid.optional(),
    cropId: uuid.optional(),
    cropVarietyId: uuid.optional(),
    cropSeasonId: uuid.optional(),
    status: cultivationStatusSchema.optional(),
  })
  .strict();

const activityQuerySchema = z
  .object({
    cultivationId: uuid.optional(),
    activityType: activityTypeSchema.optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

const harvestQuerySchema = z
  .object({
    cultivationId: uuid.optional(),
    status: harvestStatusSchema.optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

const expenseQuerySchema = z
  .object({
    farmId: uuid.optional(),
    cultivationId: uuid.optional(),
    category: expenseCategorySchema.optional(),
    source: expenseSourceSchema.optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .strict();

// Price is supplied by the caller. CROPSY does not invent a market price for
// profitability calculations; without it only cost/yield metrics are returned.
const reportQuerySchema = expenseQuerySchema.extend({
  pricePerKg: z.coerce.number().min(0.001).max(1e12).optional(),
});

const cropParamsSchema = z.object({ cropId: uuid });
const varietyParamsSchema = z.object({ cropId: uuid, varietyId: uuid });
const seasonParamsSchema = z.object({ seasonId: uuid });
const calendarParamsSchema = z.object({ calendarId: uuid });
const recommendationParamsSchema = z.object({ recommendationId: uuid });
const farmParamsSchema = z.object({ farmId: uuid });
const cultivationParamsSchema = z.object({ cultivationId: uuid });
const expenseParamsSchema = z.object({ expenseId: uuid });

function assertCultivationDates(value) {
  const sown = value.sownAt ? new Date(value.sownAt).getTime() : null;
  const planted = value.plantedAt ? new Date(value.plantedAt).getTime() : null;
  const expected = value.expectedHarvestAt ? new Date(value.expectedHarvestAt).getTime() : null;
  const harvested = value.harvestedAt ? new Date(value.harvestedAt).getTime() : null;
  if (sown != null && planted != null && planted < sown) return false;
  if (expected != null && sown != null && expected < sown) return false;
  if (expected != null && planted != null && expected < planted) return false;
  if (harvested != null && sown != null && harvested < sown) return false;
  return true;
}

function iso(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function num(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

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

function toCropDto(record) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    category: record.category,
    isActive: record.is_active,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toVarietyDto(record) {
  return {
    id: record.id,
    cropId: record.crop_id,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    maturityDays: record.maturity_days == null ? null : Number(record.maturity_days),
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toSeasonDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    startMonth: Number(record.start_month),
    endMonth: Number(record.end_month),
    year: record.year == null ? null : Number(record.year),
    isActive: record.is_active,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toCalendarDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    scopeKey: record.scope_key,
    cropId: record.crop_id,
    cropVarietyId: record.crop_variety_id || null,
    code: record.code,
    name: record.name,
    sowingStartMonth: Number(record.sowing_start_month),
    sowingEndMonth: Number(record.sowing_end_month),
    harvestDaysMin: record.harvest_days_min == null ? null : Number(record.harvest_days_min),
    harvestDaysMax: record.harvest_days_max == null ? null : Number(record.harvest_days_max),
    isActive: record.is_active,
    notes: record.notes || null,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toRecommendationDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    scopeKey: record.scope_key,
    cropId: record.crop_id,
    cropVarietyId: record.crop_variety_id || null,
    calendarId: record.calendar_id || null,
    code: record.code,
    title: record.title,
    body: record.body,
    source: record.source,
    confidence: num(record.confidence),
    ruleKey: record.rule_key || null,
    validFrom: iso(record.valid_from),
    validUntil: iso(record.valid_until),
    isActive: record.is_active,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toCultivationDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    farmId: record.farm_id,
    landParcelId: record.land_parcel_id || null,
    cropId: record.crop_id || null,
    cropVarietyId: record.crop_variety_id,
    cropSeasonId: record.crop_season_id || null,
    cropCalendarId: record.crop_calendar_id || null,
    code: record.code || null,
    status: record.status,
    sownAt: iso(record.sown_at),
    plantedAt: iso(record.planted_at),
    expectedHarvestAt: iso(record.expected_harvest_at),
    harvestedAt: iso(record.harvested_at),
    growthStage: record.growth_stage,
    areaHectares: Number(record.area_hectares),
    expectedYieldKg: num(record.expected_yield_kg),
    notes: record.notes || null,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toActivityDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    farmId: record.farm_id,
    cultivationId: record.cultivation_id || null,
    landParcelId: record.land_parcel_id || null,
    inputId: record.input_id || null,
    performedByUserId: record.performed_by_user_id || null,
    activityType: record.activity_type,
    activityDate: iso(record.activity_date),
    growthStage: record.growth_stage,
    observationSeverity: record.observation_severity || null,
    quantity: num(record.quantity),
    unitCode: record.unit_code || null,
    costAmount: num(record.cost_amount),
    currency: record.currency,
    notes: record.notes || null,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toHarvestDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    cultivationId: record.cultivation_id,
    farmId: record.farm_id,
    harvestedAt: iso(record.harvested_at),
    quantityKg: Number(record.quantity_kg),
    qualityGrade: record.quality_grade || null,
    status: record.status,
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

function toExpenseDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    farmId: record.farm_id,
    cultivationId: record.cultivation_id || null,
    category: record.category,
    source: record.source,
    expenseDate: iso(record.expense_date),
    amount: Number(record.amount),
    currency: record.currency,
    description: record.description || null,
    quantity: num(record.quantity),
    unitCode: record.unit_code || null,
    receiptUrl: record.receipt_url || null,
    receiptNote: record.receipt_note || null,
    estimateRuleKey: record.estimate_rule_key || null,
    confidence: num(record.confidence),
    createdAt: iso(record.created_at),
    updatedAt: iso(record.updated_at),
  };
}

module.exports = {
  activityCreateSchema,
  activityQuerySchema,
  calendarCreateSchema,
  calendarParamsSchema,
  calendarQuerySchema,
  calendarUpdateSchema,
  cropCreateSchema,
  cropParamsSchema,
  cropQuerySchema,
  cropUpdateSchema,
  cultivationCreateSchema,
  cultivationParamsSchema,
  cultivationQuerySchema,
  cultivationUpdateSchema,
  expenseCreateSchema,
  expenseParamsSchema,
  expenseQuerySchema,
  expenseUpdateSchema,
  farmParamsSchema,
  harvestCreateSchema,
  harvestQuerySchema,
  moduleInfoSchema,
  recommendationCreateSchema,
  recommendationParamsSchema,
  recommendationQuerySchema,
  recommendationUpdateSchema,
  reportQuerySchema,
  seasonCreateSchema,
  seasonParamsSchema,
  seasonQuerySchema,
  seasonUpdateSchema,
  varietyCreateSchema,
  varietyParamsSchema,
  varietyQuerySchema,
  varietyUpdateSchema,
  assertCultivationDates,
  toActivityDto,
  toCalendarDto,
  toCropDto,
  toCultivationDto,
  toExpenseDto,
  toHarvestDto,
  toModuleInfoDto,
  toRecommendationDto,
  toSeasonDto,
  toVarietyDto,
};
