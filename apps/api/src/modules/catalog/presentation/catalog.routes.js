const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/catalog.dto');
const { CatalogServiceToken } = require('../application/catalog.service');
const { MODULE_ID } = require('../domain/catalog.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readProducts = Object.freeze({ auth: { permissions: ['products.read'] } });
const manageProducts = Object.freeze({ auth: { permissions: ['products.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
}

module.exports = async function catalogRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(CatalogServiceToken);

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
  // Categories
  // ---------------------------------------------------------------------------

  fastify.get('/categories', { config: readProducts }, async (request) =>
    ok(
      {
        categories: await service.listCategories({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/categories', { config: manageProducts }, async (request, reply) => {
    const category = await service.createCategory({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(category, meta(request)));
  });

  fastify.patch('/categories/:id', { config: manageProducts }, async (request) => {
    const { id } = validate(dto.idParamsSchema, request.params, 'category id');
    return ok(
      await service.updateCategory({
        context: context(request),
        categoryId: id,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  // ---------------------------------------------------------------------------
  // Configurable units and quality grades
  // ---------------------------------------------------------------------------

  fastify.get('/units', { config: readProducts }, async (request) =>
    ok(
      { units: await service.listUnits({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.post('/units', { config: manageProducts }, async (request, reply) => {
    const unit = await service.createUnit({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(unit, meta(request)));
  });

  fastify.patch('/units/:id', { config: manageProducts }, async (request) => {
    const { id } = validate(dto.idParamsSchema, request.params, 'unit id');
    return ok(
      await service.updateUnit({
        context: context(request),
        unitId: id,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/quality-grades', { config: readProducts }, async (request) =>
    ok(
      {
        qualityGrades: await service.listQualityGrades({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/quality-grades', { config: manageProducts }, async (request, reply) => {
    const qualityGrade = await service.createQualityGrade({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(qualityGrade, meta(request)));
  });

  fastify.patch('/quality-grades/:id', { config: manageProducts }, async (request) => {
    const { id } = validate(dto.idParamsSchema, request.params, 'quality grade id');
    return ok(
      await service.updateQualityGrade({
        context: context(request),
        qualityGradeId: id,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  // ---------------------------------------------------------------------------
  // Flexible attribute definitions
  // ---------------------------------------------------------------------------

  fastify.get('/attributes', { config: readProducts }, async (request) =>
    ok(
      {
        attributes: await service.listAttributes({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/attributes', { config: manageProducts }, async (request, reply) => {
    const attribute = await service.createAttribute({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(attribute, meta(request)));
  });

  fastify.patch('/attributes/:id', { config: manageProducts }, async (request) => {
    const { id } = validate(dto.idParamsSchema, request.params, 'attribute id');
    return ok(
      await service.updateAttribute({
        context: context(request),
        attributeId: id,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  // ---------------------------------------------------------------------------
  // Products, attributes, images, and varieties
  // ---------------------------------------------------------------------------

  fastify.get('/products', { config: readProducts }, async (request) =>
    ok(
      {
        products: await service.listProducts({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post('/products', { config: manageProducts }, async (request, reply) => {
    const product = await service.createProduct({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(product, meta(request)));
  });

  fastify.get('/products/:productId', { config: readProducts }, async (request) => {
    const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
    return ok(await service.getProduct({ context: context(request), productId }), meta(request));
  });

  fastify.patch('/products/:productId', { config: manageProducts }, async (request) => {
    const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
    return ok(
      await service.updateProduct({
        context: context(request),
        productId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.put('/products/:productId/attributes', { config: manageProducts }, async (request) => {
    const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
    return ok(
      await service.replaceProductAttributes({
        context: context(request),
        productId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/products/:productId/images',
    { config: manageProducts },
    async (request, reply) => {
      const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
      const image = await service.addProductImage({
        context: context(request),
        productId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(image, meta(request)));
    },
  );

  fastify.delete(
    '/products/:productId/images/:imageId',
    { config: manageProducts },
    async (request) => {
      const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
      const { id: imageId } = validate(dto.idParamsSchema, request.params, 'image id');
      return ok(
        await service.deleteProductImage({
          context: context(request),
          productId,
          imageId,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.get('/products/:productId/varieties', { config: readProducts }, async (request) => {
    const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
    return ok(
      {
        varieties: await service.listVarieties({
          context: context(request),
          productId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post(
    '/products/:productId/varieties',
    { config: manageProducts },
    async (request, reply) => {
      const { productId } = validate(dto.productParamsSchema, request.params, 'product id');
      const variety = await service.createVariety({
        context: context(request),
        productId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(variety, meta(request)));
    },
  );

  fastify.patch(
    '/products/:productId/varieties/:varietyId',
    { config: manageProducts },
    async (request) => {
      const { productId, varietyId } = validate(
        dto.varietyParamsSchema,
        request.params,
        'variety identifiers',
      );
      return ok(
        await service.updateVariety({
          context: context(request),
          productId,
          varietyId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.put(
    '/products/:productId/varieties/:varietyId/attributes',
    { config: manageProducts },
    async (request) => {
      const { productId, varietyId } = validate(
        dto.varietyParamsSchema,
        request.params,
        'variety identifiers',
      );
      return ok(
        await service.replaceVarietyAttributes({
          context: context(request),
          productId,
          varietyId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );
};
