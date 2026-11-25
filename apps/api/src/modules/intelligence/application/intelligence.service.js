const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, IntelligenceEntity } = require('../domain/intelligence.entity');
const { IntelligenceRepositoryToken } = require('../domain/intelligence.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./intelligence.dto');

const IntelligenceServiceToken = Symbol.for('cropsy.service.intelligence');

class IntelligenceService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], IntelligenceRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('IntelligenceService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('IntelligenceService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new IntelligenceEntity();
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
    return validate(moduleInfoSchema, dto, 'intelligence module info');
  }
}

module.exports = { IntelligenceService, IntelligenceServiceToken };
