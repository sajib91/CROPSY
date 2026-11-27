const fs = require('node:fs');
const path = require('node:path');

const { ROOT_DIR } = require('@cropsy/config');
const { defineModule } = require('../../shared/module/define-module');
const { createOtpProviders } = require('../../shared/infrastructure/otp-provider');
const security = require('../../shared/security');
const { ConfigToken, EventBusToken, LoggerToken } = require('../../shared/di/tokens');
const { createDefaultPolicy, validatePolicy } = require('./domain/auth-policy');
const { AuthStoreToken } = require('./domain/auth.repository');
const { MODULE_ID, MODULE_NAME } = require('./domain/iam.entity');
const { IamRepositoryToken } = require('./domain/iam.repository');
const { AuthService } = require('./application/auth.service');
const { AuthorizationService } = require('./application/authorization.service');
const { IamService, IamServiceToken } = require('./application/iam.service');
const { TokenManager } = require('./application/token-manager.service');
const {
  AuthServiceToken,
  AuthorizationServiceToken,
  OtpProvidersToken,
  PasswordHasherToken,
  RateLimiterToken,
  RbacPolicyToken,
  TokenManagerToken,
} = require('./application/tokens');
const {
  IamAuthInMemoryRepository,
  IamAuthPrismaRepository,
  IamInMemoryRepository,
} = require('./infrastructure');
const iamRoutes = require('./presentation/iam.routes');

function loadRbacPolicy(env) {
  if (!env.AUTHZ_POLICY_JSON) return createDefaultPolicy();

  const source = env.AUTHZ_POLICY_JSON.trim();
  const parsed = source.startsWith('{')
    ? JSON.parse(source)
    : JSON.parse(
        fs.readFileSync(path.isAbsolute(source) ? source : path.resolve(ROOT_DIR, source), 'utf8'),
      );
  return validatePolicy(parsed);
}

function registerAuthComponents({ container }) {
  if (!container.has(RbacPolicyToken)) {
    container.register(RbacPolicyToken, (resolver) =>
      loadRbacPolicy(resolver.resolve(ConfigToken)),
    );
  }

  if (!container.has(AuthStoreToken)) {
    container.register(AuthStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.AUTH_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new IamAuthPrismaRepository({
          prisma: getPrismaClient(resolver.resolve(ConfigToken)),
        });
      }
      return new IamAuthInMemoryRepository({ policy: resolver.resolve(RbacPolicyToken) });
    });
  }

  if (!container.has(PasswordHasherToken)) {
    container.register(PasswordHasherToken, () => security.password);
  }

  if (!container.has(TokenManagerToken)) {
    container.register(
      TokenManagerToken,
      (resolver) =>
        new TokenManager({
          secret: resolver.resolve(ConfigToken).AUTH_JWT_SECRET,
          env: resolver.resolve(ConfigToken),
        }),
    );
  }

  if (!container.has(OtpProvidersToken)) {
    container.register(OtpProvidersToken, (resolver) =>
      createOtpProviders(resolver.resolve(ConfigToken)),
    );
  }

  if (!container.has(RateLimiterToken)) {
    container.register(RateLimiterToken, (resolver) =>
      security.rateLimit.createRateLimiter(resolver.resolve(ConfigToken)),
    );
  }

  if (!container.has(AuthorizationServiceToken)) {
    container.register(
      AuthorizationServiceToken,
      (resolver) =>
        new AuthorizationService({
          store: resolver.resolve(AuthStoreToken),
          tokenManager: resolver.resolve(TokenManagerToken),
          policy: resolver.resolve(RbacPolicyToken),
          eventBus: resolver.resolve(EventBusToken),
          logger: resolver.resolve(LoggerToken),
          env: resolver.resolve(ConfigToken),
        }),
    );
  }

  if (!container.has(AuthServiceToken)) {
    container.register(
      AuthServiceToken,
      (resolver) =>
        new AuthService({
          store: resolver.resolve(AuthStoreToken),
          passwordHasher: resolver.resolve(PasswordHasherToken),
          tokenManager: resolver.resolve(TokenManagerToken),
          otpProviders: resolver.resolve(OtpProvidersToken),
          rateLimiter: resolver.resolve(RateLimiterToken),
          authorization: resolver.resolve(AuthorizationServiceToken),
          eventBus: resolver.resolve(EventBusToken),
          logger: resolver.resolve(LoggerToken),
          env: resolver.resolve(ConfigToken),
          policy: resolver.resolve(RbacPolicyToken),
        }),
    );
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'iam',
  description: 'Authentication, roles, permissions, and access policy ownership.',
  dependsOn: [],
  publishes: [
    'iam.initialized',
    'iam.role.assigned',
    'iam.permission.granted',
    'iam.user.registered',
    'iam.login.succeeded',
    'iam.logout',
    'iam.otp.requested',
    'iam.otp.verified',
    'iam.authz.allowed',
    'iam.authz.denied',
  ],
  subscribes: [],
  repositoryToken: IamRepositoryToken,
  repository: IamInMemoryRepository,
  serviceToken: IamServiceToken,
  service: IamService,
  routes: iamRoutes,
  subscriptions: registerAuthComponents,
});

module.exports = {
  definition,
  routes: iamRoutes,
  loadRbacPolicy,
};
