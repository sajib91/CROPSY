const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/buyers.entity');
const { BuyersRepositoryToken } = require('./domain/buyers.repository');
const { BuyersInMemoryRepository } = require('./infrastructure/buyers.repository');
const { BuyersService, BuyersServiceToken } = require('./application/buyers.service');
const buyersRoutes = require('./presentation/buyers.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'buyers',
  description: 'Buyer profiles, procurement preferences, and organization membership.',
  dependsOn: ['users', 'organizations'],
  publishes: ['buyers.initialized', 'buyers.registered'],
  subscribes: [],
  repositoryToken: BuyersRepositoryToken,
  repository: BuyersInMemoryRepository,
  serviceToken: BuyersServiceToken,
  service: BuyersService,
  routes: buyersRoutes,
});

module.exports = { definition, routes: buyersRoutes };
