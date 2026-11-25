const { WarehouseInMemoryRepository } = require('./warehouse.repository');
const { WarehouseInMemoryStore } = require('./warehouse.store');
const { WarehousePrismaStore } = require('./warehouse-prisma.store');

module.exports = { WarehouseInMemoryRepository, WarehouseInMemoryStore, WarehousePrismaStore };
