import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(PACKAGE_DIR, '..', '..');
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

const apiSchema = sharedSchema
  .extend({
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    CORS_ORIGIN: z.string().trim().min(1).default('http://localhost:3000'),
    SERVICE_NAME: z.string().trim().min(1).default('cropsy-business-api'),
    AUTH_STORE: z.enum(['memory', 'prisma']).default('memory'),
    AUTH_JWT_SECRET: z.string().trim().min(1).default('dev-only-cropsy-access-token-secret'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
    AUTH_PURPOSE_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(128).default(12),
    AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(20).default(5),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    AUTH_OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
    AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    AUTH_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    AUTH_OTP_PROVIDER_MODE: z.enum(['http', 'preview']).default('preview'),
    AUTH_SMS_PROVIDER_URL: z.string().trim().default(''),
    AUTH_SMS_PROVIDER_TOKEN: z.string().trim().default(''),
    AUTH_EMAIL_PROVIDER_URL: z.string().trim().default(''),
    AUTH_EMAIL_PROVIDER_TOKEN: z.string().trim().default(''),
    AUTH_OTP_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
    AUTH_COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
    AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_DOMAIN: z.string().trim().default(''),
    AUTH_COOKIE_ACCESS_NAME: z.string().trim().min(1).default('cropsy_access'),
    AUTH_COOKIE_REFRESH_NAME: z.string().trim().min(1).default('cropsy_refresh'),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1000).default(10),
    AUTH_SELF_REGISTERABLE_ROLE_CODES: z
      .string()
      .trim()
      .default(
        'FARMER,BUYER,WHOLESALER,RETAILER,AGRICULTURAL_INPUT_SUPPLIER,LOGISTICS_PROVIDER,WAREHOUSE_OPERATOR,AGRICULTURAL_EXPERT,QUALITY_INSPECTOR',
      ),
    AUTHZ_POLICY_JSON: z.string().trim().default(''),
    ORGANIZATION_INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production') {
      if (value.AUTH_JWT_SECRET.length < 32 || value.AUTH_JWT_SECRET.startsWith('dev-only-')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_JWT_SECRET'],
          message: 'A strong production AUTH_JWT_SECRET is required',
        });
      }
      if (value.AUTH_STORE !== 'prisma') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_STORE'],
          message: 'Production must use the Prisma authentication store',
        });
      }
      if (value.AUTH_OTP_PROVIDER_MODE !== 'http') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_OTP_PROVIDER_MODE'],
          message: 'Production must use a real HTTP OTP provider, not preview mode',
        });
      }
      if (value.AUTH_COOKIE_SECURE === 'false') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_COOKIE_SECURE'],
          message: 'Production cookies must be secure',
        });
      }
    }

    if (value.AUTH_OTP_PROVIDER_MODE === 'http') {
      for (const [field, url] of [
        ['AUTH_SMS_PROVIDER_URL', value.AUTH_SMS_PROVIDER_URL],
        ['AUTH_EMAIL_PROVIDER_URL', value.AUTH_EMAIL_PROVIDER_URL],
      ]) {
        if (url.length === 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when AUTH_OTP_PROVIDER_MODE=http`,
          });
        }
      }
    }
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

export function loadApiEnv(source = process.env) {
  return validateEnv(apiSchema, source);
}

export function loadWebEnv(source = process.env) {
  return validateEnv(webSchema, source);
}

export function loadMobileEnv(source = process.env) {
  return validateEnv(mobileSchema, source);
}

export const schemas = {
  sharedSchema,
  apiSchema,
  webSchema,
  mobileSchema,
};

export { ROOT_DIR, ENV_FILE, formatEnvError, validateEnv };
