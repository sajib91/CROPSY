const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError, ValidationError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/orders.dto');
const { OrdersServiceToken } = require('../application/orders.service');
const { MODULE_ID } = require('../domain/orders.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readOrders = Object.freeze({ auth: { permissions: ['orders.read'] } });
const manageOrders = Object.freeze({ auth: { permissions: ['orders.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

function headerValue(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function checkoutInput(request) {
  const body = request.body || {};
  const headerKey = headerValue(request, 'idempotency-key');
  if (headerKey && body.referenceKey && headerKey !== body.referenceKey) {
    throw new ValidationError({
      message: 'Idempotency-Key and referenceKey must match when both are supplied.',
    });
  }
  const key = validate(dto.referenceKey, headerKey || body.referenceKey, 'checkout reference key');
  return { ...body, referenceKey: key };
}

module.exports = async function ordersRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(OrdersServiceToken);

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
  // Cart
  // ---------------------------------------------------------------------------

  fastify.get('/cart', { config: readOrders }, async (request) =>
    ok(await service.getCart({ context: context(request), query: request.query }), meta(request)),
  );

  fastify.post('/cart/items', { config: manageOrders }, async (request, reply) => {
    const cart = await service.addCartItem({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(cart, meta(request)));
  });

  fastify.patch('/cart/items/:listingId', { config: manageOrders }, async (request) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    return ok(
      await service.updateCartItem({
        context: context(request),
        listingId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.delete('/cart/items/:listingId', { config: manageOrders }, async (request) => {
    const { listingId } = validate(dto.listingParamsSchema, request.params, 'listing id');
    return ok(
      await service.removeCartItem({ context: context(request), listingId, request }),
      meta(request),
    );
  });

  // ---------------------------------------------------------------------------
  // Parent checkout and seller fulfillments
  // ---------------------------------------------------------------------------

  fastify.post('/checkout', { config: manageOrders }, async (request, reply) => {
    const checkout = await service.createCheckout({
      context: context(request),
      input: checkoutInput(request),
      request,
    });
    return reply.code(201).send(ok(checkout, meta(request)));
  });

  fastify.get('/checkouts', { config: readOrders }, async (request) =>
    ok(
      {
        checkouts: await service.listCheckouts({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.get('/checkouts/:checkoutId', { config: readOrders }, async (request) => {
    const { checkoutId } = validate(dto.checkoutParamsSchema, request.params, 'checkout id');
    return ok(await service.getCheckout({ context: context(request), checkoutId }), meta(request));
  });

  fastify.get('/orders', { config: readOrders }, async (request) =>
    ok(
      { orders: await service.listOrders({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.get('/orders/:orderId', { config: readOrders }, async (request) => {
    const { orderId } = validate(dto.orderParamsSchema, request.params, 'order id');
    return ok(await service.getOrder({ context: context(request), orderId }), meta(request));
  });

  fastify.post('/orders/:orderId/cancel', { config: manageOrders }, async (request) => {
    const { orderId } = validate(dto.orderParamsSchema, request.params, 'order id');
    return ok(
      await service.cancelOrder({
        context: context(request),
        orderId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post('/orders/:orderId/transitions', { config: manageOrders }, async (request) => {
    const { orderId } = validate(dto.orderParamsSchema, request.params, 'order id');
    return ok(
      await service.transitionOrder({
        context: context(request),
        orderId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/orders/:orderId/history', { config: readOrders }, async (request) => {
    const { orderId } = validate(dto.orderParamsSchema, request.params, 'order id');
    return ok(
      {
        history: await service.orderHistory({
          context: context(request),
          orderId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.get('/orders/:orderId/receipt', { config: readOrders }, async (request) => {
    const { orderId } = validate(dto.orderParamsSchema, request.params, 'order id');
    return ok(
      await service.orderReceipt({ context: context(request), orderId, request }),
      meta(request),
    );
  });
};
