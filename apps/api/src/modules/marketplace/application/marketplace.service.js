const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, MarketplaceEntity } = require('../domain/marketplace.entity');
const { MarketplaceRepositoryToken } = require('../domain/marketplace.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./marketplace.dto');

const MarketplaceServiceToken = Symbol.for('cropsy.service.marketplace');

class MarketplaceService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], MarketplaceRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('MarketplaceService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('MarketplaceService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new MarketplaceEntity();
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
    return validate(moduleInfoSchema, dto, 'marketplace module info');
  }
}

module.exports = { MarketplaceService, MarketplaceServiceToken };
