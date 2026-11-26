const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/logistics.entity');
const { LogisticsServiceToken } = require('../application/logistics.service');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const idParamsSchema = z
  .object({
    providerId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    shipmentId: z.string().uuid().optional(),
    deliveryId: z.string().uuid().optional(),
  })
  .strict();

const readShipments = Object.freeze({
  config: { auth: { permissions: ['shipments.read'] } },
});
const manageShipments = Object.freeze({
  config: { auth: { permissions: ['shipments.manage'] } },
});

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

function ids(request) {
  return validate(idParamsSchema, request.params, 'route parameters');
}

module.exports = async function logisticsRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(LogisticsServiceToken);

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

  // -------------------------------------------------------------------------
  // Logistics providers and delivery services
  // -------------------------------------------------------------------------

  fastify.get('/providers/nearby', readShipments, async (request) =>
    ok(
      await service.findNearbyProviders({
        context: context(request),
        query: request.query,
      }),
      meta(request),
    ),
  );

  fastify.get('/providers', readShipments, async (request) =>
    ok(
      await service.listProviders({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/providers', manageShipments, async (request, reply) => {
    const provider = await service.createProvider({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(provider, meta(request)));
  });

  fastify.get('/providers/:providerId', readShipments, async (request) =>
    ok(
      await service.getProvider({
        context: context(request),
        providerId: ids(request).providerId,
      }),
      meta(request),
    ),
  );

  fastify.patch('/providers/:providerId', manageShipments, async (request) =>
    ok(
      await service.updateProvider({
        context: context(request),
        providerId: ids(request).providerId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.get('/services', readShipments, async (request) =>
    ok(
      await service.listServices({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/services', manageShipments, async (request, reply) => {
    const entry = await service.createService({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(entry, meta(request)));
  });

  fastify.patch('/services/:serviceId', manageShipments, async (request) =>
    ok(
      await service.updateService({
        context: context(request),
        serviceId: ids(request).serviceId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  // -------------------------------------------------------------------------
  // Shipments
  // -------------------------------------------------------------------------

  fastify.get('/shipments', readShipments, async (request) =>
    ok(
      await service.listShipments({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.post('/shipments', manageShipments, async (request, reply) => {
    const shipment = await service.createShipment({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(shipment, meta(request)));
  });

  fastify.get('/shipments/:shipmentId', readShipments, async (request) =>
    ok(
      await service.getShipment({
        context: context(request),
        shipmentId: ids(request).shipmentId,
      }),
      meta(request),
    ),
  );

  fastify.post('/shipments/:shipmentId/pickup', manageShipments, async (request, reply) => {
    const delivery = await service.schedulePickup({
      context: context(request),
      shipmentId: ids(request).shipmentId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(delivery, meta(request)));
  });

  fastify.post('/shipments/:shipmentId/assignment', manageShipments, async (request) =>
    ok(
      await service.assignDelivery({
        context: context(request),
        shipmentId: ids(request).shipmentId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/shipments/:shipmentId/status', manageShipments, async (request) =>
    ok(
      await service.updateStatus({
        context: context(request),
        shipmentId: ids(request).shipmentId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.get('/shipments/:shipmentId/tracking', readShipments, async (request) =>
    ok(
      await service.getTracking({
        context: context(request),
        shipmentId: ids(request).shipmentId,
        query: request.query,
      }),
      meta(request),
    ),
  );

  fastify.get('/shipments/:shipmentId/history', readShipments, async (request) =>
    ok(
      await service.getHistory({
        context: context(request),
        shipmentId: ids(request).shipmentId,
        query: request.query,
      }),
      meta(request),
    ),
  );

  // -------------------------------------------------------------------------
  // Deliveries
  // -------------------------------------------------------------------------

  fastify.get('/deliveries', readShipments, async (request) =>
    ok(
      await service.listDeliveries({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  fastify.get('/deliveries/:deliveryId', readShipments, async (request) =>
    ok(
      await service.getDelivery({
        context: context(request),
        deliveryId: ids(request).deliveryId,
      }),
      meta(request),
    ),
  );

  fastify.post('/deliveries/:deliveryId/proof', manageShipments, async (request) =>
    ok(
      await service.recordProof({
        context: context(request),
        deliveryId: ids(request).deliveryId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/deliveries/:deliveryId/failure', manageShipments, async (request) =>
    ok(
      await service.recordFailure({
        context: context(request),
        deliveryId: ids(request).deliveryId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  fastify.post('/deliveries/:deliveryId/confirm', readShipments, async (request) =>
    ok(
      await service.confirmDelivery({
        context: context(request),
        deliveryId: ids(request).deliveryId,
        input: request.body,
        request,
      }),
      meta(request),
    ),
  );

  // -------------------------------------------------------------------------
  // Audits and role dashboards
  // -------------------------------------------------------------------------

  fastify.get('/audits', readShipments, async (request) =>
    ok(
      await service.listAudits({ context: context(request), query: request.query }),
      meta(request),
    ),
  );

  for (const kind of ['buyer', 'seller', 'provider']) {
    fastify.get(`/dashboard/${kind}`, readShipments, async (request) =>
      ok(
        await service.dashboard({ context: context(request), kind, query: request.query }),
        meta(request),
      ),
    );
  }
};
