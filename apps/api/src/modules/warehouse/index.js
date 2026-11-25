const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/warehouse.entity');
const { WarehouseRepositoryToken } = require('./domain/warehouse.repository');
const { WarehouseInMemoryRepository } = require('./infrastructure/warehouse.repository');
const { WarehouseService, WarehouseServiceToken } = require('./application/warehouse.service');
const warehouseRoutes = require('./presentation/warehouse.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'warehouse',
  description: 'Stores, bins, stock movements, and inventory reservations.',
  dependsOn: ['organizations', 'catalog', 'quality'],
  publishes: ['warehouse.initialized', 'warehouse.stock.moved'],
  subscribes: [],
  repositoryToken: WarehouseRepositoryToken,
  repository: WarehouseInMemoryRepository,
  serviceToken: WarehouseServiceToken,
  service: WarehouseService,
  routes: warehouseRoutes,
});

module.exports = { definition, routes: warehouseRoutes };
