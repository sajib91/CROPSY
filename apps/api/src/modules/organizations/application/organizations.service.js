const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, OrganizationsEntity } = require('../domain/organizations.entity');
const { OrganizationsRepositoryToken } = require('../domain/organizations.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./organizations.dto');

const OrganizationsServiceToken = Symbol.for('cropsy.service.organizations');

class OrganizationsService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], OrganizationsRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('OrganizationsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('OrganizationsService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new OrganizationsEntity();
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
    return validate(moduleInfoSchema, dto, 'organizations module info');
  }
}

module.exports = { OrganizationsService, OrganizationsServiceToken };
