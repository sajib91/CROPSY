const { loadApiEnv } = require('@cropsy/config');
const buildServer = require('./app');

async function start() {
  const env = loadApiEnv();
  const app = await buildServer({ env });

  try {
    const address = await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`CROPSY business API listening on ${address}`);
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
    return app;
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down CROPSY business API');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return app;
}

if (require.main === module) {
  start();
}

module.exports = { start };
