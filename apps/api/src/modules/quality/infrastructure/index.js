const { QualityInMemoryRepository } = require('./quality.repository');
const { QualityInMemoryStore } = require('./quality.store');
const { QualityPrismaStore } = require('./quality-prisma.store');

module.exports = { QualityInMemoryRepository, QualityInMemoryStore, QualityPrismaStore };
