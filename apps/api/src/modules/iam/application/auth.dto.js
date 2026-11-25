const { z } = require('@cropsy/validation');

const email = z.string().trim().email().max(255);
const phone = z
  .string()
  .trim()
  .regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Use a valid Bangladesh mobile number.');
const password = z.string().min(8).max(256);
const nonEmpty = z.string().trim().min(1);
const code = z
  .string()
  .trim()
  .regex(/^\d{4,10}$/);
const client = z.enum(['web', 'mobile']).default('mobile');
const roleCodes = z.array(nonEmpty).max(5).default([]);

const profile = z
  .object({
    firstName: nonEmpty.max(120),
    lastName: nonEmpty.max(120),
    nameBn: z.string().trim().max(240).optional(),
    preferredLanguage: z.enum(['EN', 'BN']).default('EN'),
  })
  .strict();

const registerEmailSchema = z
  .object({
    email,
    password,
    profile,
    requestedRoleCodes: roleCodes,
    client,
    deviceName: nonEmpty.max(120).optional(),
  })
  .strict();

const registerPhoneSchema = z
  .object({
    phone,
    password,
    profile,
    requestedRoleCodes: roleCodes,
    client,
    deviceName: nonEmpty.max(120).optional(),
  })
  .strict();

const otpRequestSchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    purpose: z.enum([
      'EMAIL_VERIFICATION',
      'PHONE_VERIFICATION',
      'PASSWORD_RESET',
      'LOGIN',
      'ACCOUNT_RECOVERY',
    ]),
    destination: nonEmpty.max(255),
  })
  .strict();

const otpVerifySchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    purpose: z.enum([
      'EMAIL_VERIFICATION',
      'PHONE_VERIFICATION',
      'PASSWORD_RESET',
      'LOGIN',
      'ACCOUNT_RECOVERY',
    ]),
    destination: nonEmpty.max(255),
    code,
  })
  .strict();

const loginSchema = z
  .object({
    identifier: nonEmpty.max(255),
    password,
    client,
    deviceName: nonEmpty.max(120).optional(),
  })
  .strict();

const loginOtpSchema = z
  .object({
    loginToken: nonEmpty,
    client,
    deviceName: nonEmpty.max(120).optional(),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: nonEmpty.optional(),
    client,
  })
  .strict();

const forgotPasswordSchema = z.object({ identifier: nonEmpty.max(255) }).strict();

const resetPasswordSchema = z
  .object({
    resetToken: nonEmpty,
    newPassword: password,
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: password,
    newPassword: password,
    revokeOtherSessions: z.boolean().default(true),
  })
  .strict();

const reactivateRequestSchema = z.object({ identifier: nonEmpty.max(255) }).strict();

const reactivateSchema = z
  .object({
    recoveryToken: nonEmpty,
    newPassword: password.optional(),
  })
  .strict();

const deactivateSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const rolePermissionSchema = z
  .object({
    permissions: z.array(nonEmpty).max(200),
  })
  .strict();

const auditQuerySchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    action: nonEmpty.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const sessionIdSchema = z.object({ sessionId: z.string().uuid() }).strict();
const roleCodeSchema = z.object({ roleCode: nonEmpty }).strict();
const assignRoleSchema = z
  .object({
    roleCode: nonEmpty,
    organizationId: z.string().uuid().optional(),
  })
  .strict();

module.exports = {
  assignRoleSchema,
  auditQuerySchema,
  changePasswordSchema,
  client,
  code,
  deactivateSchema,
  email,
  forgotPasswordSchema,
  loginOtpSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  password,
  phone,
  reactivateRequestSchema,
  reactivateSchema,
  refreshSchema,
  registerEmailSchema,
  registerPhoneSchema,
  resetPasswordSchema,
  roleCodeSchema,
  rolePermissionSchema,
  sessionIdSchema,
};
