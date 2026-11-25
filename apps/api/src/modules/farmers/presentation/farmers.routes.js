const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { FarmersServiceToken } = require('../application/farmers.service');
const dto = require('../application/farm.dto');
const { MODULE_ID } = require('../domain/farmers.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const authenticated = Object.freeze({ auth: {} });
const readFarm = Object.freeze({ auth: { permissions: ['farms.read'] } });
const manageFarm = Object.freeze({ auth: { permissions: ['farms.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function farmersRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(FarmersServiceToken);

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

  // Bangladesh administrative geography. These routes are authenticated but do
  // not require farm permissions; they only expose public reference data.
  fastify.get('/geo/divisions', { config: authenticated }, async (request) =>
    ok({ divisions: await service.listDivisions() }, meta(request)),
  );

  fastify.get(
    '/geo/divisions/:divisionId/districts',
    { config: authenticated },
    async (request) => {
      const { id } = validate(
        dto.geoParamsSchema,
        { id: request.params.divisionId },
        'division id',
      );
      return ok({ districts: await service.listDistricts({ divisionId: id }) }, meta(request));
    },
  );

  fastify.get('/geo/districts/:districtId/upazilas', { config: authenticated }, async (request) => {
    const { id } = validate(dto.geoParamsSchema, { id: request.params.districtId }, 'district id');
    return ok({ upazilas: await service.listUpazilas({ districtId: id }) }, meta(request));
  });

  fastify.get('/geo/upazilas/:upazilaId/unions', { config: authenticated }, async (request) => {
    const { id } = validate(dto.geoParamsSchema, { id: request.params.upazilaId }, 'upazila id');
    return ok({ unions: await service.listUnions({ upazilaId: id }) }, meta(request));
  });

  fastify.get('/farms', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    return ok({ farms: await service.listFarms({ context, query: request.query }) }, meta(request));
  });

  fastify.post('/farms', { config: manageFarm }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const farm = await service.createFarm({
      context,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(farm, meta(request)));
  });

  fastify.get('/farms/map', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(await service.getMap({ context, query: request.query }), meta(request));
  });

  fastify.get('/farms/spatial', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    return ok(await service.querySpatial({ context, query: request.query }), meta(request));
  });

  fastify.get('/farms/:farmId', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(await service.getFarm({ context, farmId }), meta(request));
  });

  fastify.patch('/farms/:farmId', { config: manageFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.updateFarm({ context, farmId, input: request.body, request }),
      meta(request),
    );
  });

  fastify.delete('/farms/:farmId', { config: manageFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(await service.archiveFarm({ context, farmId, request }), meta(request));
  });

  fastify.put('/farms/:farmId/location', { config: manageFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.upsertLocation({ context, farmId, input: request.body, request }),
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/coordinates', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(await service.getCoordinates({ context, farmId, request }), meta(request));
  });

  fastify.get('/farms/:farmId/parcels', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok({ parcels: await service.listParcels({ context, farmId }) }, meta(request));
  });

  fastify.post('/farms/:farmId/parcels', { config: manageFarm }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    const parcel = await service.addParcel({
      context,
      farmId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(parcel, meta(request)));
  });

  fastify.patch('/farms/:farmId/parcels/:parcelId', { config: manageFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId, parcelId } = validate(
      dto.parcelParamsSchema,
      request.params,
      'parcel identifiers',
    );
    return ok(
      await service.updateParcel({
        context,
        farmId,
        parcelId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/soil', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(await service.getSoil({ context, farmId }), meta(request));
  });

  fastify.post('/farms/:farmId/soil', { config: manageFarm }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    const soil = await service.upsertSoil({
      context,
      farmId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(soil, meta(request)));
  });

  fastify.patch('/farms/:farmId/soil', { config: manageFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok(
      await service.updateSoil({ context, farmId, input: request.body, request }),
      meta(request),
    );
  });

  fastify.get('/farms/:farmId/irrigations', { config: readFarm }, async (request) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    return ok({ irrigations: await service.listIrrigations({ context, farmId }) }, meta(request));
  });

  fastify.post('/farms/:farmId/irrigations', { config: manageFarm }, async (request, reply) => {
    const context = requireAuthenticated(request);
    const { farmId } = validate(dto.farmParamsSchema, request.params, 'farm id');
    const irrigation = await service.addIrrigation({
      context,
      farmId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(irrigation, meta(request)));
  });

  fastify.patch(
    '/farms/:farmId/irrigations/:irrigationId',
    { config: manageFarm },
    async (request) => {
      const context = requireAuthenticated(request);
      const { farmId, irrigationId } = validate(
        dto.irrigationParamsSchema,
        request.params,
        'irrigation identifiers',
      );
      return ok(
        await service.updateIrrigation({
          context,
          farmId,
          irrigationId,
          input: request.body,
          request,
        }),
        meta(request),
      );
    },
  );
};
