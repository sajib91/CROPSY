const { MODULE_ID, MODULE_NAME, IntelligenceEntity } = require('./intelligence.entity');
const { IntelligenceRepositoryToken } = require('./intelligence.repository');
const { AiGatewayToken } = require('./ai-gateway.entity');

module.exports = {
  AiGatewayToken,
  MODULE_ID,
  MODULE_NAME,
  IntelligenceEntity,
  IntelligenceRepositoryToken,
};
