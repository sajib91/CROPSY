const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/traceability.entity');
const { TraceabilityRepositoryToken } = require('./domain/traceability.repository');
const { TraceabilityInMemoryRepository } = require('./infrastructure/traceability.repository');
const {
  TraceabilityService,
  TraceabilityServiceToken,
} = require('./application/traceability.service');
const traceabilityRoutes = require('./presentation/traceability.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'traceability',
  description: 'Farm-to-fork chain-of-custody records and audit trails.',
  dependsOn: ['agriculture', 'quality', 'logistics', 'warehouse'],
  publishes: ['traceability.initialized', 'traceability.record.updated'],
  subscribes: [],
  repositoryToken: TraceabilityRepositoryToken,
  repository: TraceabilityInMemoryRepository,
  serviceToken: TraceabilityServiceToken,
  service: TraceabilityService,
  routes: traceabilityRoutes,
});

module.exports = { definition, routes: traceabilityRoutes };
