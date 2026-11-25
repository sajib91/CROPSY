const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, WarehouseEntity } = require('../domain/warehouse.entity');
const { WarehouseRepositoryToken } = require('../domain/warehouse.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./warehouse.dto');

const WarehouseServiceToken = Symbol.for('cropsy.service.warehouse');

class WarehouseService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], WarehouseRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('WarehouseService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('WarehouseService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new WarehouseEntity();
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
    return validate(moduleInfoSchema, dto, 'warehouse module info');
  }
}

module.exports = { WarehouseService, WarehouseServiceToken };
