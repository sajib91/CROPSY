const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/logistics.entity');
const { LogisticsRepositoryToken } = require('./domain/logistics.repository');
const { LogisticsInMemoryRepository } = require('./infrastructure/logistics.repository');
const { LogisticsService, LogisticsServiceToken } = require('./application/logistics.service');
const logisticsRoutes = require('./presentation/logistics.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'logistics',
  description: 'Shipments, carriers, route events, and delivery milestones.',
  dependsOn: ['orders', 'organizations', 'warehouse'],
  publishes: ['logistics.initialized', 'logistics.shipment.created'],
  subscribes: [],
  repositoryToken: LogisticsRepositoryToken,
  repository: LogisticsInMemoryRepository,
  serviceToken: LogisticsServiceToken,
  service: LogisticsService,
  routes: logisticsRoutes,
});

module.exports = { definition, routes: logisticsRoutes };
