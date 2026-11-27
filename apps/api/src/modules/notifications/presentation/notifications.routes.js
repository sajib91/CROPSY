const { z } = require('@cropsy/validation');
const { ok } = require('@cropsy/shared');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/notifications.entity');
const { NotificationsServiceToken } = require('../application/notifications.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const notificationParamsSchema = z.object({ notificationId: z.string().uuid() }).strict();
const revokeSchema = z.object({ token: z.string().trim().min(8).max(512) }).strict();

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

const readAuth = { auth: { permissions: ['notifications.read'] } };
const manageAuth = { auth: { permissions: ['notifications.manage'] } };

module.exports = async function notificationsRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(NotificationsServiceToken);

  fastify.get('/info', async (request) =>
    ok(await service.describe(), {
      requestId: request.requestId,
      apiVersion: request.apiVersion,
    }),
  );

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), {
      requestId: request.requestId,
      apiVersion: request.apiVersion,
    });
  });

  fastify.get('/', { config: readAuth }, async (request) =>
    ok(
      {
        notifications: await service.list({
          context: requireAuthenticated(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/read-all', { config: readAuth }, async (request) =>
    ok(await service.markAllRead({ context: requireAuthenticated(request) }), meta(request)),
  );

  fastify.post('/device-tokens', { config: readAuth }, async (request) =>
    ok(
      await service.registerDeviceToken({
        context: requireAuthenticated(request),
        input: request.body,
      }),
      meta(request),
    ),
  );

  fastify.post('/device-tokens/revoke', { config: readAuth }, async (request) => {
    const input = validate(revokeSchema, request.body || {}, 'device token revocation');
    return ok(
      await service.revokeDeviceToken({
        context: requireAuthenticated(request),
        token: input.token,
      }),
      meta(request),
    );
  });

  fastify.get('/admin/failures', { config: manageAuth }, async (request) =>
    ok(
      await service.listFailures({ context: requireAuthenticated(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/admin/:notificationId/retry', { config: manageAuth }, async (request) => {
    const { notificationId } = validate(
      notificationParamsSchema,
      request.params,
      'notification id',
    );
    return ok(
      await service.retryFailed({
        context: requireAuthenticated(request),
        notificationId,
      }),
      meta(request),
    );
  });

  fastify.get('/:notificationId/delivery', { config: readAuth }, async (request) => {
    const { notificationId } = validate(
      notificationParamsSchema,
      request.params,
      'notification id',
    );
    return ok(
      await service.listDelivery({
        context: requireAuthenticated(request),
        notificationId,
      }),
      meta(request),
    );
  });

  fastify.patch('/:notificationId/read', { config: readAuth }, async (request) => {
    const { notificationId } = validate(
      notificationParamsSchema,
      request.params,
      'notification id',
    );
    return ok(
      await service.markRead({ context: requireAuthenticated(request), notificationId }),
      meta(request),
    );
  });
};
