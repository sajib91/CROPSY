const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  PlatformAuthorizationToken,
  WarehouseAccessPortToken,
  WarehouseOperationPortToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/warehouse.entity');
const { WarehouseRepositoryToken, WarehouseStoreToken } = require('./domain/warehouse.repository');
const {
  WarehouseInMemoryRepository,
  WarehouseInMemoryStore,
  WarehousePrismaStore,
} = require('./infrastructure');
const {
  WarehouseService,
  WarehouseServiceToken,
  EVENTS,
} = require('./application/warehouse.service');
const warehouseRoutes = require('./presentation/warehouse.routes');

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function registerWarehouseInfrastructure({ container }) {
  if (!container.has(WarehouseStoreToken)) {
    container.register(WarehouseStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.WAREHOUSE_STORE === 'prisma') {
        const { getPrismaClient } = require('../../shared/database/prisma');
        return new WarehousePrismaStore({ prisma: getPrismaClient(resolver.resolve(ConfigToken)) });
      }
      return new WarehouseInMemoryStore();
    });
  }

  // Read-only composition port. Farmers uses it to validate cooperative stock
  // references; it deliberately exposes no mutation or reservation methods.
  if (!container.has(WarehouseAccessPortToken)) {
    container.register(WarehouseAccessPortToken, (resolver) => {
      const store = resolver.resolve(WarehouseStoreToken);
      return Object.freeze({
        findWarehouseById: async (id) => copy(await store.findWarehouse(id)),
        findInventoryById: async (id) => copy(await store.findInventoryById(id)),
        listInventories: async (filters) => (await store.listInventories(filters)).map(copy),
      });
    });
  }

  // Read-only warehouse operation facts for auditable traceability timelines.
  // This port exposes recorded stock, condition, and reconciliation evidence;
  // it has no mutation methods and performs no cross-module authorization.
  if (!container.has(WarehouseOperationPortToken)) {
    container.register(WarehouseOperationPortToken, (resolver) => {
      const store = resolver.resolve(WarehouseStoreToken);
      return Object.freeze({
        async getInventoryFacts(warehouseId, productId, batchCode) {
          if (!warehouseId || !productId) return null;
          const warehouse = await store.findWarehouse(warehouseId);
          if (!warehouse) return null;

          const inventoryFilters = { warehouse_id: warehouseId, product_id: productId };
          if (batchCode) inventoryFilters.batch_code = batchCode;
          const inventories = await store.listInventories(inventoryFilters);
          if (inventories.length === 0) return null;

          const inventoryIds = new Set(inventories.map((item) => item.id));
          const [movements, conditions, reconciliations, locations] = await Promise.all([
            store.listMovements({ warehouse_id: warehouseId, product_id: productId }),
            store.listConditions({ warehouse_id: warehouseId }),
            store.listReconciliations({ warehouse_id: warehouseId, product_id: productId }),
            store.listLocations({ warehouse_id: warehouseId }),
          ]);

          return {
            warehouse: {
              id: warehouse.id,
              organizationId: warehouse.organization_id ?? null,
              code: warehouse.code,
              name: warehouse.name,
              status: warehouse.status,
            },
            inventories: inventories.map((item) => ({
              id: item.id,
              warehouseId: item.warehouse_id,
              productId: item.product_id,
              batchCode: item.batch_code,
              quantityOnHand: Number(item.quantity_on_hand),
              quantityReserved: Number(item.quantity_reserved),
              availableQuantity: Number(item.available_quantity),
              unitCode: item.unit_code,
              createdAt: toIso(item.created_at),
              updatedAt: toIso(item.updated_at),
            })),
            movements: movements
              .filter((item) => inventoryIds.has(item.warehouse_inventory_id))
              .map((item) => ({
                id: item.id,
                movementType: item.movement_type,
                quantity: Number(item.quantity),
                quantityBefore: Number(item.quantity_before),
                quantityAfter: Number(item.quantity_after),
                unitCode: item.unit_code,
                referenceKey: item.reference_key ?? null,
                createdAt: toIso(item.created_at),
              })),
            conditions: conditions
              .filter((item) => inventoryIds.has(item.warehouse_inventory_id))
              .map((item) => ({
                id: item.id,
                recordedAt: toIso(item.recorded_at),
                temperatureC: Number(item.temperature_c),
                humidityPercent: Number(item.humidity_percent),
                conditionStatus: item.condition_status,
                notes: item.notes ?? null,
              })),
            reconciliations: reconciliations
              .filter((item) => inventoryIds.has(item.warehouse_inventory_id))
              .map((item) => ({
                id: item.id,
                countedQuantity: Number(item.counted_quantity),
                systemQuantity: Number(item.system_quantity),
                differenceQuantity: Number(item.difference_quantity),
                status: item.status,
                referenceKey: item.reference_key,
                createdAt: toIso(item.created_at),
              })),
            locations: locations.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              zone: item.zone ?? null,
              aisle: item.aisle ?? null,
              rack: item.rack ?? null,
              shelf: item.shelf ?? null,
              status: item.status,
            })),
          };
        },
      });
    });
  }
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'warehouse',
  description:
    'Warehouses, stock registration, reservations, movements, alerts, and inventory history.',
  dependsOn: ['organizations', 'catalog', 'iam'],
  publishes: ['warehouse.initialized', ...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: WarehouseRepositoryToken,
  repository: WarehouseInMemoryRepository,
  serviceToken: WarehouseServiceToken,
  service: WarehouseService,
  serviceDependencies: {
    store: WarehouseStoreToken,
    catalog: CatalogAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: warehouseRoutes,
  subscriptions: registerWarehouseInfrastructure,
});

module.exports = { definition, routes: warehouseRoutes, registerWarehouseInfrastructure };
