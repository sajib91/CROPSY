const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, OrdersEntity } = require('../domain/orders.entity');
const { OrdersRepositoryToken } = require('../domain/orders.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./orders.dto');

const OrdersServiceToken = Symbol.for('cropsy.service.orders');

class OrdersService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], OrdersRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('OrdersService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('OrdersService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new OrdersEntity();
      await this.repository.save(entity);
      this.eventBus.publish({
        type: `${MODULE_ID}.initialized`,
        moduleId: MODULE_ID,
        aggregateId: entity.id,
        payload: { name: entity.name },
      });
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const dto = toModuleInfoDto(entity, this.metadata);
    return validate(moduleInfoSchema, dto, 'orders module info');
  }
}

module.exports = { OrdersService, OrdersServiceToken };
