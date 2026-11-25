const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class WarehouseInMemoryRepository extends InMemoryRepository {}

module.exports = { WarehouseInMemoryRepository };
