'use strict';

/**
 * Minimal deterministic Zod -> OpenAPI 3.1 schema conversion.
 *
 * The API already validates requests with Zod. Converting those same schemas
 * keeps the published contract aligned with runtime validation instead of
 * maintaining a second, hand-written request vocabulary.
 */

function isZodSchema(value) {
  return Boolean(
    value && typeof value === 'object' && typeof value.parse === 'function' && value._def,
  );
}

function toJsonValue(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map(toJsonValue).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      const converted = toJsonValue(entry);
      if (converted !== undefined) result[key] = converted;
    }
    return result;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function describeSchema(schema, seen = new Set()) {
  if (!isZodSchema(schema)) return { schema: {}, optional: false };

  let current = schema;
  let optional = false;
  let nullable = false;
  let defaultValue;

  for (;;) {
    if (seen.has(current)) return { schema: {}, optional: true };
    seen.add(current);
    const type = current._def.typeName;

    if (type === 'ZodOptional') {
      optional = true;
      current = current._def.innerType;
      continue;
    }
    if (type === 'ZodNullable') {
      nullable = true;
      current = current._def.innerType;
      continue;
    }
    if (type === 'ZodDefault') {
      optional = true;
      defaultValue = current._def.defaultValue();
      current = current._def.innerType;
      continue;
    }
    if (type === 'ZodEffects') {
      current = current._def.schema;
      continue;
    }
    if (type === 'ZodBranded') {
      current = current._def.type;
      continue;
    }
    if (type === 'ZodPipeline') {
      current = current._def.out;
      continue;
    }
    if (type === 'ZodCatch') {
      current = current._def.innerType;
      continue;
    }
    if (type === 'ZodReadonly') {
      current = current._def.innerType;
      continue;
    }
    if (type === 'ZodLazy') {
      current = current._def.getter();
      continue;
    }
    break;
  }

  const described = convertBase(current);
  if (described.skip) return { schema: {}, optional: true };
  const result = described.schema;
  if (nullable) result.nullable = true;
  if (defaultValue !== undefined) result.default = toJsonValue(defaultValue);
  return { schema: result, optional };
}

function stringSchema(checks) {
  const result = { type: 'string' };
  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result.minLength = check.value;
        break;
      case 'max':
        result.maxLength = check.value;
        break;
      case 'length':
        result.minLength = check.value;
        result.maxLength = check.value;
        break;
      case 'regex':
        result.pattern = check.regex.source;
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      case 'email':
        result.format = 'email';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'datetime':
        result.format = 'date-time';
        break;
      case 'date':
        result.format = 'date';
        break;
      case 'time':
        result.format = 'time';
        break;
      case 'cuid':
        result.pattern = '^c[^\\s-]{8,}$';
        break;
      case 'cuid2':
        result.pattern = '^[0-9a-z]+$';
        break;
      case 'ulid':
        result.pattern = '^[0-9A-HJKMNP-TV-Z]{26}$';
        break;
      default:
        break;
    }
  }
  return result;
}

function numberSchema(checks) {
  const result = { type: 'number' };
  for (const check of checks) {
    if (check.kind === 'int') result.type = 'integer';
    if (check.kind === 'min') result.minimum = check.value;
    if (check.kind === 'max') result.maximum = check.value;
  }
  return result;
}

function convertBase(schema) {
  const def = schema._def || {};
  const type = def.typeName;

  if (type === 'ZodUndefined' || type === 'ZodVoid' || type === 'ZodNever') {
    return { skip: true, schema: {} };
  }
  if (type === 'ZodString') return { schema: stringSchema(def.checks || []) };
  if (type === 'ZodNumber') return { schema: numberSchema(def.checks || []) };
  if (type === 'ZodBoolean') return { schema: { type: 'boolean' } };
  if (type === 'ZodDate') return { schema: { type: 'string', format: 'date-time' } };
  if (type === 'ZodNull') return { schema: { type: 'null' } };
  if (type === 'ZodAny' || type === 'ZodUnknown') return { schema: {} };
  if (type === 'ZodLiteral') {
    return { schema: { const: toJsonValue(def.value) ?? null } };
  }
  if (type === 'ZodEnum') {
    return { schema: { type: 'string', enum: [...def.values] } };
  }
  if (type === 'ZodNativeEnum') {
    return { schema: { type: 'string', enum: Object.values(def.values || {}) } };
  }
  if (type === 'ZodArray') {
    const item = describeSchema(def.type);
    const result = { type: 'array', items: item.schema };
    for (const check of def.checks || []) {
      if (check.kind === 'min') result.minItems = check.value;
      if (check.kind === 'max') result.maxItems = check.value;
      if (check.kind === 'length') {
        result.minItems = check.value;
        result.maxItems = check.value;
      }
    }
    return { schema: result };
  }
  if (type === 'ZodSet') {
    const item = describeSchema(def.valueType);
    return { schema: { type: 'array', items: item.schema, uniqueItems: true } };
  }
  if (type === 'ZodObject') {
    const shape = def.shape();
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
      const described = describeSchema(value);
      properties[key] = described.schema;
      if (!described.optional) required.push(key);
    }
    const result = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    if (def.unknownKeys === 'strict') result.additionalProperties = false;
    else result.additionalProperties = true;
    if (def.catchall && isZodSchema(def.catchall)) {
      result.additionalProperties = describeSchema(def.catchall).schema;
    }
    return { schema: result };
  }
  if (type === 'ZodRecord') {
    const valueType = def.valueType ? describeSchema(def.valueType).schema : {};
    return { schema: { type: 'object', additionalProperties: valueType } };
  }
  if (type === 'ZodMap') {
    const valueType = def.valueType ? describeSchema(def.valueType).schema : {};
    return { schema: { type: 'object', additionalProperties: valueType } };
  }
  if (type === 'ZodUnion') {
    const options = [];
    let optional = false;
    for (const option of def.options || []) {
      const described = describeSchema(option);
      if (described.optional && !isZodSchema(option)) optional = true;
      options.push(described.schema);
    }
    if (options.length === 1) return { schema: options[0] };
    return { schema: { anyOf: options }, optional };
  }
  if (type === 'ZodDiscriminatedUnion') {
    return {
      schema: {
        oneOf: (def.options || []).map((option) => describeSchema(option).schema),
      },
    };
  }
  if (type === 'ZodIntersection') {
    return {
      schema: {
        allOf: [def.left, def.right].map((entry) => describeSchema(entry).schema),
      },
    };
  }
  if (type === 'ZodTuple') {
    const items = (def.items || []).map((item) => describeSchema(item).schema);
    const result = { type: 'array', prefixItems: items };
    if (def.rest && isZodSchema(def.rest)) {
      result.items = describeSchema(def.rest).schema;
    } else {
      result.maxItems = items.length;
    }
    return { schema: result };
  }
  if (type === 'ZodBigInt') return { schema: { type: 'integer' } };
  return { schema: {} };
}

function zodToOpenApiSchema(schema) {
  return describeSchema(schema).schema;
}

module.exports = {
  describeSchema,
  isZodSchema,
  zodToOpenApiSchema,
};
