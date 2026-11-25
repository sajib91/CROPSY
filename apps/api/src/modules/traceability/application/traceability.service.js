const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, TraceabilityEntity } = require('../domain/traceability.entity');
const { TraceabilityRepositoryToken } = require('../domain/traceability.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./traceability.dto');

const TraceabilityServiceToken = Symbol.for('cropsy.service.traceability');

class TraceabilityService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], TraceabilityRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('TraceabilityService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('TraceabilityService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new TraceabilityEntity();
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
    return validate(moduleInfoSchema, dto, 'traceability module info');
  }
}

module.exports = { TraceabilityService, TraceabilityServiceToken };
