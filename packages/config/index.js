const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

let dotenvLoaded = false;

function loadDotEnv() {
  if (!dotenvLoaded) {
    dotenv.config({ path: ENV_FILE });
    dotenvLoaded = true;
  }
}

const sharedSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const apiSchema = sharedSchema.extend({
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGIN: z.string().trim().min(1).default('http://localhost:3000'),
  SERVICE_NAME: z.string().trim().min(1).default('cropsy-business-api'),
  DATABASE_URL: z
    .string()
    .trim()
    .startsWith('postgresql://')
    .default('postgresql://cropsy:cropsy@localhost:5432/cropsy?schema=public'),
});

const webSchema = sharedSchema.extend({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
});

const mobileSchema = sharedSchema.extend({
  EXPO_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
});

function formatEnvError(error) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
}

function validateEnv(schema, source = process.env) {
  loadDotEnv();
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration - ${formatEnvError(result.error)}`);
  }
  return result.data;
}

function loadApiEnv(source = process.env) {
  return validateEnv(apiSchema, source);
}

function loadWebEnv(source = process.env) {
  return validateEnv(webSchema, source);
}

function loadMobileEnv(source = process.env) {
  return validateEnv(mobileSchema, source);
}

module.exports = {
  ROOT_DIR,
  ENV_FILE,
  schemas: {
    sharedSchema,
    apiSchema,
    webSchema,
    mobileSchema,
  },
  formatEnvError,
  validateEnv,
  loadApiEnv,
  loadWebEnv,
  loadMobileEnv,
};
