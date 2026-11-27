const { ok } = require('@cropsy/shared');
const { z } = require('@cropsy/validation');

const { NotFoundError } = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('../application/analytics.dto');
const { AnalyticsServiceToken } = require('../application/analytics.service');
const { MODULE_ID } = require('../domain/analytics.entity');

const paramsSchema = z.object({ moduleId: z.string().trim().min(1) });
const readTenantAnalytics = Object.freeze({
  auth: { permissions: ['analytics.read'], organizationScope: true },
});
const readPlatformAnalytics = Object.freeze({ auth: { permissions: ['analytics.platform.read'] } });

const TENANT_REPORTS = Object.freeze([
  ['/farmers/production', 'farmer.production'],
  ['/farmers/crop-yield', 'farmer.crop-yield'],
  ['/farmers/cultivation-expenses', 'farmer.cultivation-expenses'],
  ['/farmers/profitability', 'farmer.profitability'],
  ['/farmers/sales', 'farmer.sales'],
  ['/buyers/purchase-history', 'buyer.purchase-history'],
  ['/buyers/spending', 'buyer.spending'],
  ['/buyers/supplier-performance', 'buyer.supplier-performance'],
  ['/buyers/product-trends', 'buyer.product-trends'],
  ['/sellers/sales-performance', 'seller.sales-performance'],
  ['/sellers/inventory', 'seller.inventory'],
  ['/sellers/order-fulfillment', 'seller.order-fulfillment'],
  ['/sellers/revenue', 'seller.revenue'],
]);

const PLATFORM_REPORTS = Object.freeze([
  ['/platform/user-growth', 'platform.user-growth'],
  ['/platform/marketplace-activity', 'platform.marketplace-activity'],
  ['/platform/order-volume', 'platform.order-volume'],
  ['/platform/regional-activity', 'platform.regional-activity'],
  ['/platform/product-demand', 'platform.product-demand'],
  ['/platform/revenue', 'platform.revenue'],
  ['/platform/ai-usage', 'platform.ai-usage'],
]);

function meta(request) {
  return { requestId: request.requestId, apiVersion: request.apiVersion };
}

module.exports = async function analyticsRoutes(fastify) {
  const service = fastify.cropsyContainer.resolve(AnalyticsServiceToken);

  fastify.get('/info', async (request) => ok(await service.describe(), meta(request)));

  fastify.get('/info/:moduleId', async (request) => {
    const { moduleId } = validate(paramsSchema, request.params, 'module id');
    if (moduleId !== MODULE_ID) {
      throw new NotFoundError({ message: `Module '${moduleId}' is not handled by ${MODULE_ID}.` });
    }
    return ok(await service.describe(), meta(request));
  });

  for (const [path, report] of TENANT_REPORTS) {
    fastify.get(path, { config: readTenantAnalytics }, async (request) => {
      const query = validate(dto.analyticsQuerySchema, request.query, 'analytics query');
      return ok(await service.getReport({ context: request.auth, report, query }), meta(request));
    });
  }

  for (const [path, report] of PLATFORM_REPORTS) {
    fastify.get(path, { config: readPlatformAnalytics }, async (request) => {
      const query = validate(dto.analyticsQuerySchema, request.query, 'analytics query');
      return ok(await service.getReport({ context: request.auth, report, query }), meta(request));
    });
  }
};
