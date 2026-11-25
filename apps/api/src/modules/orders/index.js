const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/orders.entity');
const { OrdersRepositoryToken } = require('./domain/orders.repository');
const { OrdersInMemoryRepository } = require('./infrastructure/orders.repository');
const { OrdersService, OrdersServiceToken } = require('./application/orders.service');
const ordersRoutes = require('./presentation/orders.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'orders',
  description: 'Order lifecycle, line items, and fulfillment state transitions.',
  dependsOn: ['marketplace', 'buyers', 'catalog'],
  publishes: ['orders.initialized', 'orders.order.placed'],
  subscribes: [],
  repositoryToken: OrdersRepositoryToken,
  repository: OrdersInMemoryRepository,
  serviceToken: OrdersServiceToken,
  service: OrdersService,
  routes: ordersRoutes,
});

module.exports = { definition, routes: ordersRoutes };
