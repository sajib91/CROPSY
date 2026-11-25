const { CatalogInMemoryRepository } = require('./catalog.repository');
const { CatalogInMemoryStore } = require('./catalog.store');
const { CatalogPrismaStore } = require('./catalog-prisma.store');

module.exports = { CatalogInMemoryRepository, CatalogInMemoryStore, CatalogPrismaStore };
