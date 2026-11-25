const { KnowledgeService, KnowledgeServiceToken } = require('./knowledge.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./knowledge.dto');

module.exports = {
  KnowledgeService,
  KnowledgeServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
