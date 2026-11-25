const {
  ConfigToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  PlatformTokenManagerToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/organizations.entity');
const { OrganizationsRepositoryToken } = require('./domain/organizations.repository');
const { OrganizationsInMemoryRepository } = require('./infrastructure/organizations.repository');
const {
  OrganizationsService,
  OrganizationsServiceToken,
} = require('./application/organizations.service');
const organizationsRoutes = require('./presentation/organizations.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'organizations',
  description: 'Tenant organizations, membership, and tenant isolation keys.',
  dependsOn: ['iam', 'users'],
  publishes: ['organizations.initialized', 'organizations.created'],
  subscribes: [],
  repositoryToken: OrganizationsRepositoryToken,
  repository: OrganizationsInMemoryRepository,
  serviceToken: OrganizationsServiceToken,
  service: OrganizationsService,
  serviceDependencies: {
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    tokenManager: PlatformTokenManagerToken,
    config: ConfigToken,
  },
  routes: organizationsRoutes,
});

module.exports = { definition, routes: organizationsRoutes };
