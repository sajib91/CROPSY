const { z } = require('zod');

const isoDateTime = z.string().datetime();
const nonEmptyString = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();

function parseOrThrow(schema, value) {
  return schema.parse(value);
}

function safeParse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    return { success: false, error: result.error.flatten() };
  }
  return { success: true, data: result.data };
}

module.exports = {
  z,
  isoDateTime,
  nonEmptyString,
  positiveInteger,
  parseOrThrow,
  safeParse,
};
