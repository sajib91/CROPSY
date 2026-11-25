const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/marketplace.dto');
const { MarketplaceServiceToken } = require('../application/marketplace.service');
const { MODULE_ID } = require('../domain/marketplace.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readListings = Object.freeze({ auth: { permissions: ['listings.read'] } });
const manageListings = Object.freeze({ auth: { permissions: ['listings.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

module.exports = async function marketplaceRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(MarketplaceServiceToken);

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

  // ---------------------------------------------------------------------------
  // Seller listings and discovery
  // ---------------------------------------------------------------------------

  fastify.get('/listings', { config: readListings }, async (request) =>
    ok(
      {
        listings: await service.listListings({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/listings', { config: manageListings }, async (request, reply) => {
    const listing = await service.createListing({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(listing, meta(request)));
  });

  fastify.get('/listings/:listingId', { config: readListings }, async (request) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    return ok(await service.getListing({ context: context(request), listingId }), meta(request));
  });

  fastify.patch('/listings/:listingId', { config: manageListings }, async (request) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    return ok(
      await service.updateListing({
        context: context(request),
        listingId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post('/listings/:listingId/deactivate', { config: manageListings }, async (request) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    return ok(
      await service.deactivateListing({
        context: context(request),
        listingId,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/listings/:listingId/locations',
    { config: manageListings },
    async (request, reply) => {
      const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
      const location = await service.addLocation({
        context: context(request),
        listingId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(location, meta(request)));
    },
  );

  fastify.delete(
    '/listings/:listingId/locations/:locationId',
    { config: manageListings },
    async (request) => {
      const { listingId, locationId } = validate(
        dto.listingLocationParamsSchema,
        request.params,
        'listing location identifiers',
      );
      return ok(
        await service.deleteLocation({
          context: context(request),
          listingId,
          locationId,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/listings/:listingId/images',
    { config: manageListings },
    async (request, reply) => {
      const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
      const image = await service.addImage({
        context: context(request),
        listingId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(image, meta(request)));
    },
  );

  fastify.delete(
    '/listings/:listingId/images/:imageId',
    { config: manageListings },
    async (request) => {
      const { listingId, imageId } = validate(
        dto.listingImageParamsSchema,
        request.params,
        'listing image identifiers',
      );
      return ok(
        await service.deleteImage({
          context: context(request),
          listingId,
          imageId,
          request,
        }),
        meta(request),
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Favorites and seller profiles
  // ---------------------------------------------------------------------------

  fastify.get('/favorites', { config: readListings }, async (request) =>
    ok({ favorites: await service.listFavorites({ context: context(request) }) }, meta(request)),
  );

  fastify.post('/favorites/:listingId', { config: readListings }, async (request) => {
    const { listingId } = validate(dto.favoriteParamsSchema, request.params, 'listing id');
    return ok(
      await service.addFavorite({ context: context(request), listingId, request }),
      meta(request),
    );
  });

  fastify.delete('/favorites/:listingId', { config: readListings }, async (request) => {
    const { listingId } = validate(dto.favoriteParamsSchema, request.params, 'listing id');
    return ok(
      await service.removeFavorite({ context: context(request), listingId, request }),
      meta(request),
    );
  });

  fastify.get('/sellers/:sellerId', { config: readListings }, async (request) => {
    const { sellerId } = validate(dto.sellerParamsSchema, request.params, 'seller id');
    return ok(await service.getSeller({ sellerId }), meta(request));
  });

  // ---------------------------------------------------------------------------
  // Reports and platform-mediated messages
  // ---------------------------------------------------------------------------

  fastify.post('/listings/:listingId/reports', { config: readListings }, async (request, reply) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    const report = await service.createReport({
      context: context(request),
      listingId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(report, meta(request)));
  });

  fastify.get('/reports', { config: readListings }, async (request) =>
    ok(
      {
        reports: await service.listReports({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.patch('/reports/:reportId/review', { config: manageListings }, async (request) => {
    const { reportId } = validate(dto.reportParamsSchema, request.params, 'report id');
    return ok(
      await service.reviewReport({
        context: context(request),
        reportId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/listings/:listingId/messages',
    { config: readListings },
    async (request, reply) => {
      const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
      const message = await service.createMessage({
        context: context(request),
        listingId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(message, meta(request)));
    },
  );

  fastify.get('/messages', { config: readListings }, async (request) =>
    ok(
      {
        messages: await service.listMessages({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.patch('/messages/:messageId/read', { config: readListings }, async (request) => {
    const { messageId } = validate(dto.messageParamsSchema, request.params, 'message id');
    return ok(
      await service.markMessageRead({ context: context(request), messageId, request }),
      meta(request),
    );
  });
};
