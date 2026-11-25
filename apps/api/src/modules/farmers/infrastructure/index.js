const { FarmersInMemoryRepository } = require('./farmers.repository');
const { FarmInMemoryStore } = require('./farm.repository');
const { FarmPrismaStore } = require('./farm-prisma.repository');

module.exports = {
  FarmersInMemoryRepository,
  FarmInMemoryStore,
  FarmPrismaStore,
};
