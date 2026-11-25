const { assertRepository } = require('../../../shared/domain/repository');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID, KnowledgeEntity } = require('../domain/knowledge.entity');
const { KnowledgeRepositoryToken } = require('../domain/knowledge.repository');
const { moduleInfoSchema, toModuleInfoDto } = require('./knowledge.dto');

const KnowledgeServiceToken = Symbol.for('cropsy.service.knowledge');

class KnowledgeService {
  constructor({ repository, eventBus, logger, metadata }) {
    assertRepository(repository, ['get', 'save'], KnowledgeRepositoryToken);
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('KnowledgeService requires an event bus.');
    }
    if (!metadata) {
      throw new TypeError('KnowledgeService requires module metadata.');
    }
    this.repository = repository;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new KnowledgeEntity();
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
    return validate(moduleInfoSchema, dto, 'knowledge module info');
  }
}

module.exports = { KnowledgeService, KnowledgeServiceToken };
