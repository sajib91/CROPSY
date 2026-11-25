const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, LedgerEntity } = require('../domain/ledger.entity');
const { LedgerRepositoryToken } = require('../domain/ledger.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./ledger.dto');

const LedgerServiceToken = Symbol.for('cropsy.service.ledger');

class LedgerService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], LedgerRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('LedgerService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('LedgerService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new LedgerEntity();
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
    return validate(moduleInfoSchema, dto, 'ledger module info');
  }
}

module.exports = { LedgerService, LedgerServiceToken };
