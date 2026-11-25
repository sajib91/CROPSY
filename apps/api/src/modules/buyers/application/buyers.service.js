const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, BuyersEntity } = require('../domain/buyers.entity');
const { BuyersRepositoryToken } = require('../domain/buyers.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./buyers.dto');

const BuyersServiceToken = Symbol.for('cropsy.service.buyers');

class BuyersService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], BuyersRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('BuyersService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('BuyersService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new BuyersEntity();
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
    return validate(moduleInfoSchema, dto, 'buyers module info');
  }
}

module.exports = { BuyersService, BuyersServiceToken };
