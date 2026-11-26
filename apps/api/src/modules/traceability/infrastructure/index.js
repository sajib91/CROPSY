const { TraceabilityInMemoryRepository } = require('./traceability.repository');
const { TraceabilityInMemoryStore } = require('./traceability.store');
const { TraceabilityPrismaStore } = require('./traceability-prisma.store');

module.exports = {
  TraceabilityInMemoryRepository,
  TraceabilityInMemoryStore,
  TraceabilityPrismaStore,
};
