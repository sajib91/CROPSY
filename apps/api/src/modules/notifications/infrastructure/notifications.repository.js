const { InMemoryRepository } = require('../../../shared/infrastructure/repository');

class NotificationsInMemoryRepository extends InMemoryRepository {}

module.exports = { NotificationsInMemoryRepository };
