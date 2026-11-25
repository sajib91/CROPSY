const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/farmers.entity');
const { FarmersRepositoryToken } = require('./domain/farmers.repository');
const { FarmersInMemoryRepository } = require('./infrastructure/farmers.repository');
const { FarmersService, FarmersServiceToken } = require('./application/farmers.service');
const farmersRoutes = require('./presentation/farmers.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'farmers',
  description: 'Farmer registration, profiles, and organization membership.',
  dependsOn: ['users', 'organizations'],
  publishes: ['farmers.initialized', 'farmers.registered'],
  subscribes: [],
  repositoryToken: FarmersRepositoryToken,
  repository: FarmersInMemoryRepository,
  serviceToken: FarmersServiceToken,
  service: FarmersService,
  routes: farmersRoutes,
});

module.exports = { definition, routes: farmersRoutes };
