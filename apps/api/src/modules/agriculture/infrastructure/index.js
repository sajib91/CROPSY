const { AgricultureInMemoryRepository } = require('./agriculture.repository');
const { AgricultureInMemoryStore } = require('./agriculture.store');
const { AgriculturePrismaStore } = require('./agriculture-prisma.store');

module.exports = {
  AgricultureInMemoryRepository,
  AgricultureInMemoryStore,
  AgriculturePrismaStore,
};
