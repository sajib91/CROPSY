const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, BillingEntity } = require('../domain/billing.entity');
const { BillingRepositoryToken } = require('../domain/billing.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./billing.dto');

const BillingServiceToken = Symbol.for('cropsy.service.billing');

class BillingService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], BillingRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('BillingService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('BillingService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new BillingEntity();
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
    return validate(moduleInfoSchema, dto, 'billing module info');
  }
}

module.exports = { BillingService, BillingServiceToken };
