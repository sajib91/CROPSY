const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { requireAuthenticated } = require('../../../shared/http/authorization');
const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const { FarmersServiceToken } = require('../application/farmers.service');
const dto = require('../application/farm.dto');
const cooperativeDto = require('../application/cooperative.dto');
const { MODULE_ID } = require('../domain/farmers.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const authenticated = Object.freeze({ auth: {} });
const readFarm = Object.freeze({ auth: { permissions: ['farms.read'] } });
const manageFarm = Object.freeze({ auth: { permissions: ['farms.manage'] } });
const readOrders = Object.freeze({ auth: { permissions: ['orders.read'] } });
const manageOrders = Object.freeze({ auth: { permissions: ['orders.manage'] } });

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

function context(request) {
  return requireAuthenticated(request);
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

  // -------------------------------------------------------------------------
  // Cooperative farmer groups and collective selling. Every non-info route
  // declares an explicit permission; unconfigured routes are denied by the
  // platform authorization hook.
  // -------------------------------------------------------------------------

  fastify.get('/groups', { config: readFarm }, async (request) =>
    ok(
      { groups: await service.listGroups({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );

  fastify.post('/groups', { config: manageFarm }, async (request, reply) => {
    const group = await service.createGroup({
      context: context(request),
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(group, meta(request)));
  });

  fastify.get('/groups/:groupId', { config: readFarm }, async (request) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    return ok(await service.getGroup({ context: context(request), groupId }), meta(request));
  });

  fastify.patch('/groups/:groupId', { config: manageFarm }, async (request) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    return ok(
      await service.updateGroup({
        context: context(request),
        groupId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/groups/:groupId/members', { config: readFarm }, async (request) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    return ok(
      {
        members: await service.listGroupMembers({
          context: context(request),
          groupId,
          query: request.query,
        }),
      },
      meta(request),
    );
  });

  fastify.post('/groups/:groupId/members', { config: manageFarm }, async (request, reply) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    const member = await service.joinGroup({
      context: context(request),
      groupId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(member, meta(request)));
  });

  fastify.patch('/groups/:groupId/members/:userId', { config: manageFarm }, async (request) => {
    const { groupId, userId } = validate(
      cooperativeDto.memberParamsSchema,
      request.params,
      'membership identifiers',
    );
    return ok(
      await service.decideMembership({
        context: context(request),
        groupId,
        userId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.delete('/groups/:groupId/members/:userId', { config: manageFarm }, async (request) => {
    const { groupId, userId } = validate(
      cooperativeDto.memberParamsSchema,
      request.params,
      'membership identifiers',
    );
    return ok(
      await service.removeMember({ context: context(request), groupId, userId, request }),
      meta(request),
    );
  });

  fastify.get('/groups/:groupId/campaigns', { config: readFarm }, async (request) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    return ok(
      {
        campaigns: await service.listCampaigns({
          context: context(request),
          query: { ...request.query, groupId },
        }),
      },
      meta(request),
    );
  });

  fastify.post('/groups/:groupId/campaigns', { config: manageFarm }, async (request, reply) => {
    const { groupId } = validate(cooperativeDto.groupParamsSchema, request.params, 'group id');
    const campaign = await service.createCampaign({
      context: context(request),
      groupId,
      input: request.body,
      request,
    });
    return reply.code(201).send(ok(campaign, meta(request)));
  });

  fastify.get('/campaigns', { config: readFarm }, async (request) =>
    ok(
      {
        campaigns: await service.listCampaigns({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.get('/campaigns/:campaignId', { config: readFarm }, async (request) => {
    const { campaignId } = validate(
      cooperativeDto.campaignParamsSchema,
      request.params,
      'campaign id',
    );
    return ok(await service.getCampaign({ context: context(request), campaignId }), meta(request));
  });

  fastify.patch('/campaigns/:campaignId', { config: manageFarm }, async (request) => {
    const { campaignId } = validate(
      cooperativeDto.campaignParamsSchema,
      request.params,
      'campaign id',
    );
    return ok(
      await service.updateCampaign({
        context: context(request),
        campaignId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.get('/campaigns/:campaignId/contributions', { config: readFarm }, async (request) => {
    const { campaignId } = validate(
      cooperativeDto.campaignParamsSchema,
      request.params,
      'campaign id',
    );
    return ok(
      {
        contributions: await service.listContributions({
          context: context(request),
          query: { ...request.query, campaignId },
        }),
      },
      meta(request),
    );
  });

  fastify.post(
    '/campaigns/:campaignId/contributions',
    { config: manageFarm },
    async (request, reply) => {
      const { campaignId } = validate(
        cooperativeDto.campaignParamsSchema,
        request.params,
        'campaign id',
      );
      const contribution = await service.createContribution({
        context: context(request),
        campaignId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(contribution, meta(request)));
    },
  );

  fastify.get('/contributions', { config: readFarm }, async (request) =>
    ok(
      {
        contributions: await service.listContributions({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.get('/contributions/:contributionId', { config: readFarm }, async (request) => {
    const { contributionId } = validate(
      cooperativeDto.contributionParamsSchema,
      request.params,
      'contribution id',
    );
    return ok(
      await service.getContribution({ context: context(request), contributionId }),
      meta(request),
    );
  });

  fastify.patch('/contributions/:contributionId', { config: manageFarm }, async (request) => {
    const { contributionId } = validate(
      cooperativeDto.contributionParamsSchema,
      request.params,
      'contribution id',
    );
    return ok(
      await service.updateContribution({
        context: context(request),
        contributionId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/contributions/:contributionId/confirm',
    { config: manageFarm },
    async (request) => {
      const { contributionId } = validate(
        cooperativeDto.contributionParamsSchema,
        request.params,
        'contribution id',
      );
      return ok(
        await service.decideContribution({
          context: context(request),
          contributionId,
          input: { decision: 'CONFIRM' },
          request,
        }),
        meta(request),
      );
    },
  );

  fastify.post('/contributions/:contributionId/reject', { config: manageFarm }, async (request) => {
    const { contributionId } = validate(
      cooperativeDto.contributionParamsSchema,
      request.params,
      'contribution id',
    );
    return ok(
      await service.decideContribution({
        context: context(request),
        contributionId,
        input: { decision: 'REJECT' },
        request,
      }),
      meta(request),
    );
  });

  fastify.get(
    '/campaigns/:campaignId/purchase-requests',
    { config: readOrders },
    async (request) => {
      const { campaignId } = validate(
        cooperativeDto.campaignParamsSchema,
        request.params,
        'campaign id',
      );
      return ok(
        {
          purchaseRequests: await service.listPurchaseRequests({
            context: context(request),
            query: { ...request.query, campaignId },
          }),
        },
        meta(request),
      );
    },
  );

  fastify.post(
    '/campaigns/:campaignId/purchase-requests',
    { config: manageOrders },
    async (request, reply) => {
      const { campaignId } = validate(
        cooperativeDto.campaignParamsSchema,
        request.params,
        'campaign id',
      );
      const purchaseRequest = await service.createPurchaseRequest({
        context: context(request),
        campaignId,
        input: request.body,
        request,
      });
      return reply.code(201).send(ok(purchaseRequest, meta(request)));
    },
  );

  fastify.get('/purchase-requests', { config: readOrders }, async (request) =>
    ok(
      {
        purchaseRequests: await service.listPurchaseRequests({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.get('/purchase-requests/:requestId', { config: readOrders }, async (request) => {
    const { requestId } = validate(
      cooperativeDto.purchaseRequestParamsSchema,
      request.params,
      'purchase request id',
    );
    return ok(
      await service.getPurchaseRequest({ context: context(request), requestId }),
      meta(request),
    );
  });

  fastify.patch('/purchase-requests/:requestId', { config: manageFarm }, async (request) => {
    const { requestId } = validate(
      cooperativeDto.purchaseRequestParamsSchema,
      request.params,
      'purchase request id',
    );
    return ok(
      await service.decidePurchaseRequest({
        context: context(request),
        requestId,
        input: request.body,
        request,
      }),
      meta(request),
    );
  });

  fastify.post(
    '/purchase-requests/:requestId/allocations',
    { config: manageFarm },
    async (request) => {
      const { requestId } = validate(
        cooperativeDto.purchaseRequestParamsSchema,
        request.params,
        'purchase request id',
      );
      return ok(
        {
          allocations: await service.proposeAllocations({
            context: context(request),
            requestId,
            input: request.body,
            request,
          }),
        },
        meta(request),
      );
    },
  );

  fastify.get('/allocations', { config: readFarm }, async (request) =>
    ok(
      {
        allocations: await service.listAllocations({
          context: context(request),
          query: request.query,
        }),
      },
      meta(request),
    ),
  );

  fastify.post(
    '/purchase-requests/:requestId/finalize',
    { config: manageFarm },
    async (request) => {
      const { requestId } = validate(
        cooperativeDto.purchaseRequestParamsSchema,
        request.params,
        'purchase request id',
      );
      return ok(
        {
          earnings: await service.finalizePurchaseRequest({
            context: context(request),
            requestId,
            request,
          }),
        },
        meta(request),
      );
    },
  );

  fastify.get('/earnings/me', { config: readFarm }, async (request) =>
    ok(
      {
        earnings: await service.listMyEarnings({ context: context(request), query: request.query }),
      },
      meta(request),
    ),
  );

  fastify.get('/earnings', { config: readFarm }, async (request) =>
    ok(
      { earnings: await service.listEarnings({ context: context(request), query: request.query }) },
      meta(request),
    ),
  );
};
