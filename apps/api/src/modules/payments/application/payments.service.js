const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, PaymentsEntity } = require('../domain/payments.entity');
const { PaymentsRepositoryToken } = require('../domain/payments.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./payments.dto');

const PaymentsServiceToken = Symbol.for('cropsy.service.payments');

class PaymentsService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], PaymentsRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('PaymentsService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('PaymentsService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new PaymentsEntity();
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
    return validate(moduleInfoSchema, dto, 'payments module info');
  }
}

module.exports = { PaymentsService, PaymentsServiceToken };
