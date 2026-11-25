const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { UsersServiceToken } = require('../application/users.service');
const dto = require('../application/users.dto');
const { MODULE_ID } = require('../domain/users.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function usersRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(UsersServiceToken);

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({
        message: `Module '${moduleId}' is not handled by ${MODULE_ID}.`,
      });
    }
    return ok(await service.describe(), meta(request));
  });

  fastify.get('/me', { config: { auth: { permissions: ['profile.read'] } } }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(await service.getProfile({ context, userId: context.user.id }), meta(request));
  });

  fastify.patch(
    '/me/profile',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        await service.updateProfile({
          context,
          userId: context.user.id,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.patch(
    '/me/contact',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        await service.updateContact({
          context,
          userId: context.user.id,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/me/addresses',
    { config: { auth: { permissions: ['profile.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        { addresses: await service.listAddresses({ context, userId: context.user.id }) },
        meta(request),
      );
    },
  );

  fastify.post(
    '/me/addresses',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const address = await service.addAddress({
        context,
        userId: context.user.id,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(address, meta(request)));
    },
  );

  fastify.patch(
    '/me/addresses/:addressId',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { addressId } = validate(dto.addressIdParamsSchema, request.params, 'address id');
      return ok(
        await service.updateAddress({
          context,
          userId: context.user.id,
          addressId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/me/preferences',
    { config: { auth: { permissions: ['profile.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        { preferences: await service.listPreferences({ context, userId: context.user.id }) },
        meta(request),
      );
    },
  );

  fastify.put(
    '/me/preferences',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        {
          preferences: await service.replacePreferences({
            context,
            userId: context.user.id,
            input: request.body,
            request,
          }),
        },
        meta(request),
      );
    },
  );

  fastify.get(
    '/me/role-profiles',
    { config: { auth: { permissions: ['profile.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        await service.listRoleProfiles({ context, userId: context.user.id }),
        meta(request),
      );
    },
  );

  fastify.put(
    '/me/roles/:roleCode/profile',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { roleCode } = validate(dto.roleCodeParamsSchema, request.params, 'role code');
      return ok(
        await service.upsertRoleProfile({
          context,
          userId: context.user.id,
          roleCode,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/me/farmer-profile',
    { config: { auth: { permissions: ['profile.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        await service.getFarmerProfile({ context, userId: context.user.id }),
        meta(request),
      );
    },
  );

  fastify.put(
    '/me/farmer-profile',
    { config: { auth: { permissions: ['profile.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      return ok(
        await service.upsertFarmerProfile({
          context,
          userId: context.user.id,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/:userId',
    { config: { auth: { permissions: ['users.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(await service.getProfile({ context, userId }), meta(request));
    },
  );

  fastify.patch(
    '/:userId/profile',
    { config: { auth: { permissions: ['users.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(
        await service.updateProfile({
          context,
          userId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.patch(
    '/:userId/contact',
    { config: { auth: { permissions: ['users.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(
        await service.updateContact({
          context,
          userId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/:userId/addresses',
    { config: { auth: { permissions: ['users.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok({ addresses: await service.listAddresses({ context, userId }) }, meta(request));
    },
  );

  fastify.get(
    '/:userId/preferences',
    { config: { auth: { permissions: ['users.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok({ preferences: await service.listPreferences({ context, userId }) }, meta(request));
    },
  );

  fastify.get(
    '/:userId/role-profiles',
    { config: { auth: { permissions: ['users.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(await service.listRoleProfiles({ context, userId }), meta(request));
    },
  );

  fastify.get(
    '/:userId/farmer-profile',
    { config: { auth: { permissions: ['users.read'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(await service.getFarmerProfile({ context, userId }), meta(request));
    },
  );

  fastify.patch(
    '/:userId/farmer-profile',
    { config: { auth: { permissions: ['users.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId } = validate(dto.userIdParamsSchema, request.params, 'user id');
      return ok(
        await service.upsertFarmerProfile({
          context,
          userId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.put(
    '/:userId/roles/:roleCode/profile',
    { config: { auth: { permissions: ['users.manage'] } } },
    async (request) => {
      const context = requireAuthenticated(request);
      const { userId, roleCode } = validate(
        z.object({ userId: z.string().uuid(), roleCode: z.string().trim().min(1) }).strict(),
        request.params,
        'user and role identifiers',
      );
      return ok(
        await service.upsertRoleProfile({
          context,
          userId,
          roleCode,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );
};
