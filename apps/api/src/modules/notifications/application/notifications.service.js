const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, NotificationsEntity } = require('../domain/notifications.entity');
const { NotificationsRepositoryToken } = require('../domain/notifications.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./notifications.dto');

const NotificationsServiceToken = Symbol.for('cropsy.service.notifications');

class NotificationsService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], NotificationsRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('NotificationsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('NotificationsService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new NotificationsEntity();
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
    return validate(moduleInfoSchema, dto, 'notifications module info');
  }
}

module.exports = { NotificationsService, NotificationsServiceToken };
