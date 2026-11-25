const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/agriculture.entity');
const { AgricultureRepositoryToken } = require('./domain/agriculture.repository');
const { AgricultureInMemoryRepository } = require('./infrastructure/agriculture.repository');
const {
  AgricultureService,
  AgricultureServiceToken,
} = require('./application/agriculture.service');
const agricultureRoutes = require('./presentation/agriculture.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'agriculture',
  description: 'Crop cycles, agronomic seasons, plots, and cultivation records.',
  dependsOn: ['organizations', 'farmers'],
  publishes: ['agriculture.initialized', 'agriculture.season.created'],
  subscribes: [],
  repositoryToken: AgricultureRepositoryToken,
  repository: AgricultureInMemoryRepository,
  serviceToken: AgricultureServiceToken,
  service: AgricultureService,
  routes: agricultureRoutes,
});

module.exports = { definition, routes: agricultureRoutes };
