let sharedPrismaClient = null;

/**
 * Returns the process-wide PrismaClient. Module stores used to create one client
 * each, which multiplied the connection pool by the number of modules. Keeping
 * a single lazily-created client preserves Prisma's intended pool size while
 * avoiding a database connection for memory-store test/dev runs.
 */
function getPrismaClient(env) {
  if (!sharedPrismaClient) {
    const { PrismaClient } = require('@prisma/client');
    sharedPrismaClient = new PrismaClient({
      datasources: env?.DATABASE_URL ? { db: { url: env.DATABASE_URL } } : undefined,
    });
  }
  return sharedPrismaClient;
}

async function disconnectPrisma() {
  if (!sharedPrismaClient) return;
  const client = sharedPrismaClient;
  sharedPrismaClient = null;
  await client.$disconnect();
}

module.exports = { getPrismaClient, disconnectPrisma };
