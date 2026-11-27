const {
  ConfigToken,
  IdentityStoreToken,
  LogisticsAccessPortToken,
  PlatformAuthorizationToken,
  QualityAccessPortToken,
  TraceabilityBatchPortToken,
  WarehouseOperationPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/traceability.entity');
const {
  TraceabilityRepositoryToken,
  TraceabilityStoreToken,
} = require('./domain/traceability.repository');
const {
  TraceabilityInMemoryRepository,
  TraceabilityInMemoryStore,
  TraceabilityPrismaStore,
} = require('./infrastructure');
const {
  EVENTS,
  TraceabilityService,
  TraceabilityServiceToken,
} = require('./application/traceability.service');
const {
  toBatchDto,
  toEventDto,
  toPublicVerificationDto,
} = require('./application/traceability.dto');
const traceabilityRoutes = require('./presentation/traceability.routes');

function registerTraceabilityInfrastructure({ container }) {
  if (!container.has(TraceabilityStoreToken)) {
    container.register(TraceabilityStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.TRACEABILITY_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new TraceabilityPrismaStore({
          prisma: getPrismaClient(resolver.resolve(ConfigToken)),
        });
      }
      return new TraceabilityInMemoryStore();
    });
  }

  // Narrow, read-only self-port. Other modules can read verified public facts
  // or private batch facts without gaining traceability mutation capabilities.
  if (!container.has(TraceabilityBatchPortToken)) {
    container.register(TraceabilityBatchPortToken, (resolver) => {
      const store = resolver.resolve(TraceabilityStoreToken);
      return Object.freeze({
        async getPublicFacts(token) {
          const batch = await store.findBatchByToken(token);
          if (
            !batch ||
            batch.verification_status !== 'VERIFIED' ||
            batch.public_disclosure !== true
          ) {
            return [];
          }
          const events = await store.listEvents({ batch_id: batch.id });
          return toPublicVerificationDto(batch, events).facts;
        },
        async getBatchFacts(batchId) {
          const batch = await store.findBatch(batchId);
          if (!batch) return null;
          const events = await store.listEvents({ batch_id: batchId });
          return {
            batch: toBatchDto(batch),
            events: events.map(toEventDto),
          };
        },
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'traceability',
  description: 'Farm-to-fork chain-of-custody records and audit trails.',
  dependsOn: ['agriculture', 'quality', 'logistics', 'warehouse'],
  publishes: [
    ...new Set([
      'traceability.initialized',
      'traceability.record.updated',
      ...Object.values(EVENTS),
    ]),
  ],
  subscribes: [],
  repositoryToken: TraceabilityRepositoryToken,
  repository: TraceabilityInMemoryRepository,
  serviceToken: TraceabilityServiceToken,
  service: TraceabilityService,
  serviceDependencies: {
    store: TraceabilityStoreToken,
    qualityAccess: QualityAccessPortToken,
    warehouseAccess: WarehouseOperationPortToken,
    logisticsAccess: LogisticsAccessPortToken,
    traceabilityBatch: TraceabilityBatchPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: traceabilityRoutes,
  subscriptions: registerTraceabilityInfrastructure,
});

module.exports = {
  definition,
  routes: traceabilityRoutes,
  registerTraceabilityInfrastructure,
};
