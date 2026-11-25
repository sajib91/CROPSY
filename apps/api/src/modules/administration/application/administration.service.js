const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, AdministrationEntity } = require('../domain/administration.entity');
const { AdministrationRepositoryToken } = require('../domain/administration.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./administration.dto');

const AdministrationServiceToken = Symbol.for('cropsy.service.administration');

class AdministrationService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], AdministrationRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('AdministrationService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('AdministrationService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new AdministrationEntity();
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
    return validate(moduleInfoSchema, dto, 'administration module info');
  }
}

module.exports = { AdministrationService, AdministrationServiceToken };
