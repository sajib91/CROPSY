const { ValidationError } = require('../kernel/errors');

function validate(schema, value, label = 'input') {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError({
      message: `Invalid ${label}`,
      details: result.error.flatten(),
    });
  }
  return result.data;
}

module.exports = { validate };
