const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class PaymentsInMemoryRepository extends InMemoryRepository {}

module.exports = { PaymentsInMemoryRepository };
