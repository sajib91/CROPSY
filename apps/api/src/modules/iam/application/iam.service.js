const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, IamEntity } = require('../domain/iam.entity');
const { IamRepositoryToken } = require('../domain/iam.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./iam.dto');

const IamServiceToken = Symbol.for('cropsy.service.iam');

class IamService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], IamRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('IamService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('IamService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new IamEntity();
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
    return validate(moduleInfoSchema, dto, 'iam module info');
  }
}

module.exports = { IamService, IamServiceToken };
