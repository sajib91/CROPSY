const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, CatalogEntity } = require('../domain/catalog.entity');
const { CatalogRepositoryToken } = require('../domain/catalog.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./catalog.dto');

const CatalogServiceToken = Symbol.for('cropsy.service.catalog');

class CatalogService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], CatalogRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('CatalogService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('CatalogService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new CatalogEntity();
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
    return validate(moduleInfoSchema, dto, 'catalog module info');
  }
}

module.exports = { CatalogService, CatalogServiceToken };
