const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, FarmersEntity } = require('../domain/farmers.entity');
const { FarmersRepositoryToken } = require('../domain/farmers.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./farmers.dto');

const FarmersServiceToken = Symbol.for('cropsy.service.farmers');

class FarmersService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], FarmersRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('FarmersService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('FarmersService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new FarmersEntity();
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
    return validate(moduleInfoSchema, dto, 'farmers module info');
  }
}

module.exports = { FarmersService, FarmersServiceToken };
