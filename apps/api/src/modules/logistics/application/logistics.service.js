const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, LogisticsEntity } = require('../domain/logistics.entity');
const { LogisticsRepositoryToken } = require('../domain/logistics.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./logistics.dto');

const LogisticsServiceToken = Symbol.for('cropsy.service.logistics');

class LogisticsService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], LogisticsRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('LogisticsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('LogisticsService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new LogisticsEntity();
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
    return validate(moduleInfoSchema, dto, 'logistics module info');
  }
}

module.exports = { LogisticsService, LogisticsServiceToken };
