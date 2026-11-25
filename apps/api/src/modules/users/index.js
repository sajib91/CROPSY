const { IdentityStoreToken, PlatformAuthorizationToken } = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/users.entity');
const { UsersRepositoryToken } = require('./domain/users.repository');
const { UsersInMemoryRepository } = require('./infrastructure/users.repository');
const { UsersService, UsersServiceToken } = require('./application/users.service');
const usersRoutes = require('./presentation/users.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'users',
  description: 'User profiles, preferences, and account lifecycle boundaries.',
  dependsOn: ['iam'],
  publishes: ['users.initialized', 'users.profile.updated'],
  subscribes: [],
  repositoryToken: UsersRepositoryToken,
  repository: UsersInMemoryRepository,
  serviceToken: UsersServiceToken,
  service: UsersService,
  serviceDependencies: {
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
  },
  routes: usersRoutes,
});

module.exports = { definition, routes: usersRoutes };
