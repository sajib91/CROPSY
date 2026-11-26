const { Entity } = require('../../../shared/kernel/entity');

const MODULE_ID = 'market-intelligence';
const MODULE_NAME = 'Agricultural Market Intelligence';

const EVIDENCE_CLASSES = Object.freeze([
  'historical_observation',
  'statistical_estimate',
  'ml_prediction',
  'llm_generated_explanation',
]);

const MARKET_ANALYSIS_METHODS = Object.freeze([
  'priceHistory',
  'regionalComparison',
  'supplyDemand',
  'trendVisualization',
  'seasonalPatterns',
  'availability',
  'opportunities',
  'sellingInsights',
  'forecast',
]);

class MarketIntelligenceEntity extends Entity {
  constructor({ id } = {}) {
    super({ id, moduleId: MODULE_ID, name: MODULE_NAME });
  }
}

module.exports = {
  EVIDENCE_CLASSES,
  MARKET_ANALYSIS_METHODS,
  MODULE_ID,
  MODULE_NAME,
  MarketIntelligenceEntity,
};
