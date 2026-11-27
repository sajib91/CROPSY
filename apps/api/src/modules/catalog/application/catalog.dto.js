const { isoDateTime, z } = require('@cropsy/validation');

const { ATTRIBUTE_VALUE_TYPES } = require('../domain/catalog.entity');

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const longText = z.string().trim().max(4000);
const code = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/i, 'Code may contain letters, digits, underscores, and hyphens.');
const sku = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Z0-9._-]+$/i, 'SKU may contain letters, digits, dots, underscores, and hyphens.');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD.');
const imageUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Image URL must use http or https.',
  });

const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'));

const nullableText = (schema = shortText) => schema.nullable().optional();

const moduleInfoSchema = z.object({
  id: z.string().uuid(),
  moduleId: shortText,
  name: shortText,
  description: shortText,
  status: shortText,
  path: shortText,
  dependsOn: z.array(shortText),
  publishes: z.array(shortText),
  subscribes: z.array(shortText),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const categoryCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    parentId: uuid.nullable().optional(),
    code,
    name: shortText,
    nameBn: nullableText(),
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isActive: z.boolean().default(true),
  })
  .strict();

const categoryUpdateSchema = z
  .object({
    parentId: uuid.nullable().optional(),
    name: shortText.optional(),
    nameBn: nullableText(),
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isActive: z.boolean().optional(),
  })
  .strict();

const categoryQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
    parentId: uuid.optional(),
    code: shortText.optional(),
    search: z.string().trim().max(180).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

const unitCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    code,
    name: shortText,
    nameBn: nullableText(),
    dimension: nullableText(),
    isActive: z.boolean().default(true),
  })
  .strict();

const unitUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    dimension: nullableText(),
    isActive: z.boolean().optional(),
  })
  .strict();

const unitQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
    search: z.string().trim().max(180).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

const qualityGradeCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    code,
    name: shortText,
    nameBn: nullableText(),
    description: nullableText(longText),
    minScore: z.number().min(0).max(100).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

const qualityGradeUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    description: nullableText(longText),
    minScore: z.number().min(0).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const qualityGradeQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
    search: z.string().trim().max(180).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

const attributeCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    categoryId: uuid.nullable().optional(),
    code,
    name: shortText,
    nameBn: nullableText(),
    valueType: z.enum(ATTRIBUTE_VALUE_TYPES),
    allowedValues: z.array(z.string().trim().min(1).max(180)).max(100).nullable().optional(),
    unitCode: nullableText(),
    groupCode: nullableText(),
    isRequired: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.valueType === 'ENUM' && (!value.allowedValues || value.allowedValues.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowedValues'],
        message: 'ENUM attributes require at least one allowed value.',
      });
    }
  });

const attributeUpdateSchema = z
  .object({
    categoryId: uuid.nullable().optional(),
    name: shortText.optional(),
    nameBn: nullableText(),
    allowedValues: z.array(z.string().trim().min(1).max(180)).max(100).nullable().optional(),
    unitCode: nullableText(),
    groupCode: nullableText(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const attributeQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
    categoryId: uuid.optional(),
    valueType: z.enum(ATTRIBUTE_VALUE_TYPES).optional(),
    search: z.string().trim().max(180).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

const attributeValueSchema = z
  .object({
    attributeId: uuid,
    value: z.union([z.string().trim().min(1).max(4000), z.number(), z.boolean()]),
  })
  .strict();

const attributeValuesReplaceSchema = z
  .object({ values: z.array(attributeValueSchema).max(100) })
  .strict();

const productImageCreateSchema = z
  .object({
    url: imageUrl,
    altText: nullableText(),
    altTextBn: nullableText(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .strict();

const productCreateSchema = z
  .object({
    organizationId: uuid.nullable().optional(),
    categoryId: uuid,
    sku,
    name: shortText,
    nameBn: nullableText(),
    unitCode: code,
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isAvailable: z.boolean().default(true),
    values: z.array(attributeValueSchema).max(100).default([]),
    images: z.array(productImageCreateSchema).max(20).default([]),
  })
  .strict();

const productUpdateSchema = z
  .object({
    categoryId: uuid.optional(),
    name: shortText.optional(),
    nameBn: nullableText(),
    unitCode: code.optional(),
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isAvailable: z.boolean().optional(),
  })
  .strict();

const productQuerySchema = z
  .object({
    organizationId: uuid.optional(),
    includeGlobal: booleanQuery.default(true),
    categoryId: uuid.optional(),
    categoryCode: shortText.optional(),
    search: z.string().trim().max(180).optional(),
    unitCode: code.optional(),
    isAvailable: booleanQuery.optional(),
    attributeCode: shortText.optional(),
    attributeValue: z.string().trim().max(4000).optional(),
  })
  .strict();

const varietyCreateSchema = z
  .object({
    code,
    name: shortText,
    nameBn: nullableText(),
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isActive: z.boolean().default(true),
    values: z.array(attributeValueSchema).max(100).default([]),
  })
  .strict();

const varietyUpdateSchema = z
  .object({
    name: shortText.optional(),
    nameBn: nullableText(),
    description: nullableText(longText),
    descriptionBn: nullableText(longText),
    isActive: z.boolean().optional(),
  })
  .strict();

const varietyQuerySchema = z
  .object({
    search: z.string().trim().max(180).optional(),
    isActive: booleanQuery.optional(),
  })
  .strict();

const paramsSchema = z.object({ moduleId: shortText });
const idParamsSchema = z.object({ id: uuid });
const productParamsSchema = z.object({ productId: uuid });
const varietyParamsSchema = z.object({ productId: uuid, varietyId: uuid });

function toCategoryDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    parentId: record.parent_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    description: record.description || null,
    descriptionBn: record.description_bn || null,
    isActive: record.is_active,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toUnitDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    dimension: record.dimension || null,
    isActive: record.is_active,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toQualityGradeDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    description: record.description || null,
    minScore: record.min_score ?? null,
    isActive: record.is_active,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toAttributeDto(record) {
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    categoryId: record.category_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    valueType: record.value_type,
    allowedValues: record.allowed_values ?? null,
    unitCode: record.unit_code || null,
    groupCode: record.group_code || null,
    isRequired: record.is_required,
    isActive: record.is_active,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function attributeValue(record, definition) {
  if (record.value_boolean !== null && record.value_boolean !== undefined)
    return record.value_boolean;
  if (record.value_number !== null && record.value_number !== undefined) return record.value_number;
  if (record.value_date) return isoDate.parse(record.value_date.toISOString().slice(0, 10));
  if (record.value_json !== null && record.value_json !== undefined) return record.value_json;
  if (definition?.value_type === 'NUMBER' && typeof record.value_text === 'string') {
    return Number(record.value_text);
  }
  return record.value_text ?? null;
}

function toAttributeValueDto(record, definition) {
  return {
    id: record.id,
    attributeId: record.attribute_id,
    code: definition?.code || null,
    name: definition?.name || null,
    nameBn: definition?.name_bn || null,
    valueType: definition?.value_type || null,
    value: attributeValue(record, definition),
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toImageDto(record) {
  return {
    id: record.id,
    url: record.url,
    altText: record.alt_text || null,
    altTextBn: record.alt_text_bn || null,
    sortOrder: record.sort_order,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toVarietyDto(record, related = {}) {
  return {
    id: record.id,
    productId: record.product_id,
    organizationId: record.organization_id || null,
    code: record.code,
    name: record.name,
    nameBn: record.name_bn || null,
    description: record.description || null,
    descriptionBn: record.description_bn || null,
    isActive: record.is_active,
    attributes: (related.attributeValues || []).map((item) =>
      toAttributeValueDto(
        item,
        related.attributeDefinitions?.find((definition) => definition.id === item.attribute_id),
      ),
    ),
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

function toProductDto(record, related = {}) {
  const category =
    related.categoryById?.get(record.category_id) ??
    related.categories?.find((item) => item.id === record.category_id);
  const unit =
    related.unitById?.get(record.unit_id) ??
    related.units?.find((item) => item.id === record.unit_id);
  const attributeDefinitions = related.attributeDefinitions || [];
  return {
    id: record.id,
    organizationId: record.organization_id || null,
    categoryId: record.category_id,
    categoryCode: category?.code || null,
    categoryName: category?.name || null,
    categoryNameBn: category?.name_bn || null,
    sku: record.sku,
    name: record.name,
    nameBn: record.name_bn || null,
    unitCode: record.unit_code,
    unitName: unit?.name || null,
    unitNameBn: unit?.name_bn || null,
    description: record.description || null,
    descriptionBn: record.description_bn || null,
    isAvailable: record.is_available,
    attributes: (related.attributeValues || []).map((item) =>
      toAttributeValueDto(
        item,
        related.attributeDefinitionById?.get(item.attribute_id) ??
          attributeDefinitions.find((definition) => definition.id === item.attribute_id),
      ),
    ),
    images: (related.images || []).map(toImageDto),
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
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

module.exports = {
  attributeCreateSchema,
  attributeQuerySchema,
  attributeUpdateSchema,
  attributeValuesReplaceSchema,
  categoryCreateSchema,
  categoryQuerySchema,
  categoryUpdateSchema,
  idParamsSchema,
  moduleInfoSchema,
  paramsSchema,
  productCreateSchema,
  productImageCreateSchema,
  productParamsSchema,
  productQuerySchema,
  productUpdateSchema,
  qualityGradeCreateSchema,
  qualityGradeQuerySchema,
  qualityGradeUpdateSchema,
  unitCreateSchema,
  unitQuerySchema,
  unitUpdateSchema,
  varietyCreateSchema,
  varietyParamsSchema,
  varietyQuerySchema,
  varietyUpdateSchema,
  toAttributeDto,
  toAttributeValueDto,
  toCategoryDto,
  toImageDto,
  toModuleInfoDto,
  toProductDto,
  toQualityGradeDto,
  toUnitDto,
  toVarietyDto,
};
