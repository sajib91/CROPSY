const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  LogisticsAccessPortToken,
  PlatformAuthorizationToken,
  QualityAccessPortToken,
  WarehouseAccessPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/quality.entity');
const { QualityRepositoryToken, QualityStoreToken } = require('./domain/quality.repository');
const {
  QualityInMemoryRepository,
  QualityInMemoryStore,
  QualityPrismaStore,
} = require('./infrastructure');
const { toInspectionFactsDto } = require('./application/quality.dto');
const { EVENTS, QualityService, QualityServiceToken } = require('./application/quality.service');
const qualityRoutes = require('./presentation/quality.routes');

// Internal composition token: it resolves optional read-only ports so the
// service can validate cross-module references without importing other modules.
const QualityReferenceAccessToken = Symbol.for('cropsy.module.quality.referenceAccess');

function registerQualityInfrastructure({ container }) {
  if (!container.has(QualityStoreToken)) {
    container.register(QualityStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.QUALITY_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new QualityPrismaStore({ prisma: getPrismaClient(resolver.resolve(ConfigToken)) });
      }
      return new QualityInMemoryStore();
    });
  }

  // Read-only traceability port. Private evidence is never published through
  // this boundary; only explicitly disclosed evidence on verified inspections
  // is included.
  if (!container.has(QualityAccessPortToken)) {
    container.register(QualityAccessPortToken, (resolver) => {
      const store = resolver.resolve(QualityStoreToken);
      return Object.freeze({
        async getInspectionFacts(inspectionId) {
          const inspection = await store.findInspection(inspectionId);
          if (!inspection) return null;
          const evidence = await store.listEvidence({ inspection_id: inspectionId });
          return toInspectionFactsDto(inspection, evidence);
        },
      });
    });
  }

  if (!container.has(QualityReferenceAccessToken)) {
    container.register(QualityReferenceAccessToken, (resolver) => {
      const optional = (token) => (resolver.has(token) ? resolver.resolve(token) : null);
      const logistics = optional(LogisticsAccessPortToken);
      const warehouse = optional(WarehouseAccessPortToken);
      const catalog = optional(CatalogAccessPortToken);

      return Object.freeze({
        async findShipment(shipmentId) {
          if (!logistics || typeof logistics.getShipmentFacts !== 'function') return undefined;
          return logistics.getShipmentFacts(shipmentId);
        },
        async findInventory(inventoryId) {
          if (!warehouse || typeof warehouse.findInventoryById !== 'function') return undefined;
          return warehouse.findInventoryById(inventoryId);
        },
        async findWarehouse(warehouseId) {
          if (!warehouse || typeof warehouse.findWarehouseById !== 'function') return undefined;
          return warehouse.findWarehouseById(warehouseId);
        },
        async findProduct(productId) {
          if (!catalog || typeof catalog.findProduct !== 'function') return undefined;
          return catalog.findProduct(productId);
        },
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'quality',
  description: 'Inspection plans, results, certificates, and quality holds.',
  dependsOn: ['organizations', 'catalog', 'farmers'],
  publishes: [
    ...new Set(['quality.initialized', 'quality.inspection.completed', ...Object.values(EVENTS)]),
  ],
  subscribes: [],
  repositoryToken: QualityRepositoryToken,
  repository: QualityInMemoryRepository,
  serviceToken: QualityServiceToken,
  service: QualityService,
  serviceDependencies: {
    store: QualityStoreToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
    referenceAccess: QualityReferenceAccessToken,
  },
  routes: qualityRoutes,
  subscriptions: registerQualityInfrastructure,
});

module.exports = {
  definition,
  routes: qualityRoutes,
  registerQualityInfrastructure,
  QualityReferenceAccessToken,
};
