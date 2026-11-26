const { LogisticsInMemoryRepository } = require('./logistics.repository');
const { LogisticsInMemoryStore } = require('./logistics.store');
const { LogisticsPrismaStore } = require('./logistics-prisma.store');

module.exports = { LogisticsInMemoryRepository, LogisticsInMemoryStore, LogisticsPrismaStore };
