const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, AgricultureEntity } = require('../domain/agriculture.entity');
const { AgricultureRepositoryToken } = require('../domain/agriculture.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./agriculture.dto');

const AgricultureServiceToken = Symbol.for('cropsy.service.agriculture');

class AgricultureService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], AgricultureRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('AgricultureService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('AgricultureService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new AgricultureEntity();
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
    return validate(moduleInfoSchema, dto, 'agriculture module info');
  }
}

module.exports = { AgricultureService, AgricultureServiceToken };
