const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { MODULE_ID } = require('../domain/warehouse.entity');
const { WarehouseServiceToken } = require('../application/warehouse.service');
const dto = require('../application/warehouse.dto');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readWarehouses = Object.freeze({ auth: { permissions: ['warehouses.read'] } });
const manageWarehouses = Object.freeze({ auth: { permissions: ['warehouses.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

module.exports = async function warehouseRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(WarehouseServiceToken);

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

  fastify.get('/warehouses', { config: readWarehouses }, async (request) =>
    ok(
      {
        warehouses: await service.listWarehouses({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/warehouses', { config: manageWarehouses }, async (request, reply) => {
    const warehouse = await service.createWarehouse({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(warehouse, meta(request)));
  });

  fastify.get('/warehouses/:warehouseId', { config: readWarehouses }, async (request) => {
    const { warehouseId } = validate(dto.warehouseParamsSchema, request.params, 'warehouse id');
    return ok(
      await service.getWarehouse({ context: context(request), warehouseId }),
      meta(request),
    );
  });

  fastify.patch('/warehouses/:warehouseId', { config: manageWarehouses }, async (request) => {
    const { warehouseId } = validate(dto.warehouseParamsSchema, request.params, 'warehouse id');
    return ok(
      await service.updateWarehouse({
        context: context(request),
        warehouseId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/inventories', { config: readWarehouses }, async (request) =>
    ok(
      {
        inventories: await service.listInventories({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/inventories', { config: manageWarehouses }, async (request, reply) => {
    const inventory = await service.registerStock({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(inventory, meta(request)));
  });

  fastify.get('/inventories/:inventoryId', { config: readWarehouses }, async (request) => {
    const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
    return ok(
      await service.getInventory({ context: context(request), inventoryId }),
      meta(request),
    );
  });

  fastify.patch('/inventories/:inventoryId', { config: manageWarehouses }, async (request) => {
    const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
    return ok(
      await service.updateStock({
        context: context(request),
        inventoryId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/inventories/:inventoryId/adjustments',
    { config: manageWarehouses },
    async (request) => {
      const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
      return ok(
        await service.adjustStock({
          context: context(request),
          inventoryId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/inventories/:inventoryId/damaged',
    { config: manageWarehouses },
    async (request) => {
      const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
      return ok(
        await service.recordDamaged({
          context: context(request),
          inventoryId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/inventories/:inventoryId/expired',
    { config: manageWarehouses },
    async (request) => {
      const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
      return ok(
        await service.recordExpired({
          context: context(request),
          inventoryId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/inventories/:inventoryId/deductions',
    { config: manageWarehouses },
    async (request) => {
      const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
      return ok(
        await service.deductStock({
          context: context(request),
          inventoryId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/inventories/:inventoryId/reservations',
    { config: manageWarehouses },
    async (request, reply) => {
      const { inventoryId } = validate(dto.inventoryParamsSchema, request.params, 'inventory id');
      const reservation = await service.reserveStock({
        context: context(request),
        inventoryId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(reservation, meta(request)));
    },
  );

  fastify.get('/reservations', { config: readWarehouses }, async (request) =>
    ok(
      {
        reservations: await service.listReservations({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.get('/reservations/:reservationId', { config: readWarehouses }, async (request) => {
    const { reservationId } = validate(
      dto.reservationParamsSchema,
      request.params,
      'reservation id',
    );
    return ok(
      await service.getReservation({ context: context(request), reservationId }),
      meta(request),
    );
  });

  fastify.post(
    '/reservations/:reservationId/release',
    { config: manageWarehouses },
    async (request) => {
      const { reservationId } = validate(
        dto.reservationParamsSchema,
        request.params,
        'reservation id',
      );
      return ok(
        await service.releaseReservation({
          context: context(request),
          reservationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post(
    '/reservations/:reservationId/deduct',
    { config: manageWarehouses },
    async (request) => {
      const { reservationId } = validate(
        dto.reservationParamsSchema,
        request.params,
        'reservation id',
      );
      return ok(
        await service.deductReservation({
          context: context(request),
          reservationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get('/movements', { config: readWarehouses }, async (request) =>
    ok(
      {
        movements: await service.listMovements({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.get('/alerts', { config: readWarehouses }, async (request) =>
    ok(
      { alerts: await service.listAlerts({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.post('/alerts/:alertId/acknowledge', { config: manageWarehouses }, async (request) => {
    const { alertId } = validate(dto.alertParamsSchema, request.params, 'alert id');
    return ok(
      await service.acknowledgeAlert({
        context: context(request),
        alertId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post('/alerts/:alertId/resolve', { config: manageWarehouses }, async (request) => {
    const { alertId } = validate(dto.alertParamsSchema, request.params, 'alert id');
    return ok(
      await service.resolveAlert({
        context: context(request),
        alertId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });
};
