const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const {
  refreshTokenFromRequest,
  requestCredentials,
  requireAuthenticated,
} = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { setAuthCookies } = require('../../../shared/security/cookies');
const { validate } = require('../../../shared/validation/validate');
const { OrganizationsServiceToken } = require('../application/organizations.service');
const dto = require('../application/organizations.dto');
const { MODULE_ID } = require('../domain/organizations.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function organizationsRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(OrganizationsServiceToken);
  const env = fastify.cropsyEnv;

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

  fastify.get('/types', { config: { auth: {} } }, async (request) =>
    ok({ types: service.listTypes() }, meta(request)),
  );

  fastify.post('/switch', { config: { auth: {} } }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const input = validate(dto.switchOrganizationSchema, request.body, 'organization switch');
    const result = await service.switchOrganization({ context, input, request });

    const credentials = requestCredentials(request, env);
    if (credentials.via === 'cookie') {
      setAuthCookies(
        reply,
        {
          ...result,
          refreshToken: refreshTokenFromRequest(request, env) || '',
          client: 'web',
        },
        env,
        request,
      );
    }
    return ok(result, meta(request));
  });

  fastify.post('/invitations/accept', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    const input = validate(dto.invitationTokenSchema, request.body, 'invitation acceptance');
    return ok(await service.acceptInvitation({ context, input, request }), meta(request));
  });

  fastify.get('/', { config: { auth: {} } }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(
      { organizations: await service.listOrganizations({ context, query: request.query }) },
      meta(request),
    );
  });

  fastify.post(
    '/',
    { config: { auth: { permissions: ['organizations.create'] } } },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const result = await service.createOrganization({
        context,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(result, meta(request)));
    },
  );

  fastify.get(
    '/:organizationId',
    {
      config: {
        auth: { permissions: ['organizations.read'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(await service.getOrganization({ context, organizationId }), meta(request));
    },
  );

  fastify.patch(
    '/:organizationId',
    {
      config: {
        auth: { permissions: ['organizations.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        await service.updateOrganization({
          context,
          organizationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.patch(
    '/:organizationId/status',
    {
      config: {
        auth: { permissions: ['organizations.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        await service.setStatus({
          context,
          organizationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.patch(
    '/:organizationId/verification',
    {
      config: {
        auth: { permissions: ['organizations.verify'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        await service.verifyOrganization({
          context,
          organizationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/:organizationId/members',
    {
      config: {
        auth: { permissions: ['members.read'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok({ members: await service.listMembers({ context, organizationId }) }, meta(request));
    },
  );

  fastify.delete(
    '/:organizationId/members/:userId',
    {
      config: {
        auth: { permissions: ['members.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId, userId } = validate(
        dto.memberParamsSchema,
        request.params,
        'member identifiers',
      );
      return ok(
        await service.removeMember({ context, organizationId, userId, request }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/:organizationId/invitations',
    {
      config: {
        auth: { permissions: ['invitations.manage'], organizationScope: true },
      },
    },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      const result = await service.inviteMember({
        context,
        organizationId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(result, meta(request)));
    },
  );

  fastify.get(
    '/:organizationId/invitations',
    {
      config: {
        auth: { permissions: ['invitations.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        { invitations: await service.listInvitations({ context, organizationId }) },
        meta(request),
      );
    },
  );

  fastify.delete(
    '/:organizationId/invitations/:invitationId',
    {
      config: {
        auth: { permissions: ['invitations.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId, invitationId } = validate(
        dto.invitationParamsSchema,
        request.params,
        'invitation identifiers',
      );
      return ok(
        await service.cancelInvitation({ context, organizationId, invitationId, request }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/:organizationId/addresses',
    {
      config: {
        auth: { permissions: ['organizations.read'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        { addresses: await service.listAddresses({ context, organizationId }) },
        meta(request),
      );
    },
  );

  fastify.post(
    '/:organizationId/addresses',
    {
      config: {
        auth: { permissions: ['organizations.manage'], organizationScope: true },
      },
    },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      const address = await service.addAddress({
        context,
        organizationId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(address, meta(request)));
    },
  );

  fastify.patch(
    '/:organizationId/addresses/:addressId',
    {
      config: {
        auth: { permissions: ['organizations.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId, addressId } = validate(
        dto.addressParamsSchema,
        request.params,
        'address identifiers',
      );
      return ok(
        await service.updateAddress({
          context,
          organizationId,
          addressId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get(
    '/:organizationId/documents',
    {
      config: {
        auth: { permissions: ['documents.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      return ok(
        { documents: await service.listDocuments({ context, organizationId }) },
        meta(request),
      );
    },
  );

  fastify.post(
    '/:organizationId/documents',
    {
      config: {
        auth: { permissions: ['documents.manage'], organizationScope: true },
      },
    },
    async (request, reply) => {
      const context = requireAuthenticated(request);
      const { organizationId } = validate(
        dto.organizationIdParamsSchema,
        request.params,
        'organization id',
      );
      const document = await service.addDocument({
        context,
        organizationId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(document, meta(request)));
    },
  );

  fastify.patch(
    '/:organizationId/documents/:documentId',
    {
      config: {
        auth: { permissions: ['documents.manage'], organizationScope: true },
      },
    },
    async (request) => {
      const context = requireAuthenticated(request);
      const { organizationId, documentId } = validate(
        dto.documentParamsSchema,
        request.params,
        'document identifiers',
      );
      return ok(
        await service.updateDocument({
          context,
          organizationId,
          documentId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );
};
