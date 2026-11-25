const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class OrdersInMemoryRepository extends InMemoryRepository {}

module.exports = { OrdersInMemoryRepository };
