const { RateLimiterToken } = require('../../../shared/di/tokens');

const AuthServiceToken = Symbol.for('cropsy.iam.authService');
const AuthorizationServiceToken = Symbol.for('cropsy.iam.authorizationService');
const TokenManagerToken = Symbol.for('cropsy.iam.tokenManager');
const PasswordHasherToken = Symbol.for('cropsy.iam.passwordHasher');
const OtpProvidersToken = Symbol.for('cropsy.iam.otpProviders');
const RbacPolicyToken = Symbol.for('cropsy.iam.rbacPolicy');

module.exports = {
  AuthServiceToken,
  AuthorizationServiceToken,
  TokenManagerToken,
  PasswordHasherToken,
  OtpProvidersToken,
  RateLimiterToken,
  RbacPolicyToken,
};
