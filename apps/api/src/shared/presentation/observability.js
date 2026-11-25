const { randomUUID } = require('node:crypto');

const { assertRequestedVersion } = require('../http/versioning');

function headerValue(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function applyObservability(fastify, options) {
  const { apiVersion } = options;

  fastify.decorateRequest('requestId', null);
  fastify.decorateRequest('apiVersion', null);
  fastify.decorateRequest('moduleId', null);

  fastify.addHook('onRequest', async (request, reply) => {
    request.requestId = headerValue(request.headers['x-request-id']) || randomUUID();
    reply.header('x-request-id', request.requestId);

    assertRequestedVersion(headerValue(request.headers['x-api-version']), apiVersion.version);
    request.apiVersion = apiVersion.version;

    const pathname = request.url.split('?')[0];
    const segments = pathname.replace(apiVersion.prefix, '').split('/').filter(Boolean);
    request.moduleId = segments[0] || 'platform';
  });

  fastify.addHook('onResponse', async (request, reply) => {
    fastify.log.info(
      {
        requestId: request.requestId,
        apiVersion: request.apiVersion,
        moduleId: request.moduleId,
        method: request.method,
        path: request.url.split('?')[0],
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request.completed',
    );
  });
}

module.exports = applyObservability;
