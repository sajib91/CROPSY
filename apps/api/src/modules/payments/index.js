const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/payments.entity');
const { PaymentsRepositoryToken } = require('./domain/payments.repository');
const { PaymentsInMemoryRepository } = require('./infrastructure/payments.repository');
const { PaymentsService, PaymentsServiceToken } = require('./application/payments.service');
const paymentsRoutes = require('./presentation/payments.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'payments',
  description: 'Payment attempts, provider-agnostic records, and reconciliation state.',
  dependsOn: ['orders', 'organizations'],
  publishes: ['payments.initialized', 'payments.payment.recorded'],
  subscribes: [],
  repositoryToken: PaymentsRepositoryToken,
  repository: PaymentsInMemoryRepository,
  serviceToken: PaymentsServiceToken,
  service: PaymentsService,
  routes: paymentsRoutes,
});

module.exports = { definition, routes: paymentsRoutes };
