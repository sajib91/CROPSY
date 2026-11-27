const { AnalyticsInMemoryRepository } = require('./analytics.repository');
const { AnalyticsInMemoryStore } = require('./analytics.store');
const { AnalyticsPrismaStore } = require('./analytics-prisma.store');

module.exports = {
  AnalyticsInMemoryRepository,
  AnalyticsInMemoryStore,
  AnalyticsPrismaStore,
};
