const { Prisma } = require('@prisma/client');

const { assertRepository } = require('../../../shared/domain/repository');
const { InfrastructureError } = require('../../../shared/kernel/errors');
const { AnalyticsStoreToken } = require('../domain/analytics.repository');

function normalizeScalar(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalizeScalar);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeScalar(entry)]),
    );
  }
  return value;
}

function organizationClause(alias, organizationId) {
  if (!organizationId) return Prisma.sql``;
  return Prisma.sql` AND ${Prisma.raw(alias)} = ${organizationId}::uuid`;
}

function actorClause(alias, actorUserId, isOrganizationAdmin) {
  if (isOrganizationAdmin || !actorUserId) return Prisma.sql``;
  return Prisma.sql` AND ${Prisma.raw(alias)} = ${actorUserId}::uuid`;
}

function periodClause(expression, query) {
  const conditions = [];
  if (query?.from) {
    conditions.push(Prisma.sql`${Prisma.raw(expression)} >= ${query.from}`);
  }
  if (query?.to) {
    conditions.push(Prisma.sql`${Prisma.raw(expression)} <= ${query.to}`);
  }
  if (conditions.length === 0) return Prisma.sql``;
  return Prisma.sql` AND ${Prisma.join(conditions, ' AND ')}`;
}

function bucket(expression, grain) {
  const column = Prisma.raw(expression);
  if (grain === 'day') return Prisma.sql`date_trunc('day', ${column})`;
  if (grain === 'week') return Prisma.sql`date_trunc('week', ${column})`;
  return Prisma.sql`date_trunc('month', ${column})`;
}

function limitClause(query) {
  return Prisma.sql` LIMIT ${query?.limit || 100}`;
}

function translateError(error, report) {
  if (error instanceof InfrastructureError) return error;
  return new InfrastructureError({
    message: 'The analytics report could not be read.',
    details: { code: 'analytics_store_unavailable', report, cause: error?.code || error?.message },
  });
}

/**
 * Read-only SQL adapter. Every query binds tenant and actor identifiers as
 * parameters and filters organization_id inside PostgreSQL; there is no
 * post-query tenant filtering and no caller-controlled SQL fragment.
 */
class AnalyticsPrismaStore {
  constructor({ prisma } = {}) {
    assertRepository(prisma, ['$queryRaw'], AnalyticsStoreToken);
    this.prisma = prisma;
  }

  async readReport({ report, organizationId, actorUserId, isOrganizationAdmin, query } = {}) {
    const context = {
      organizationId,
      actorUserId,
      isOrganizationAdmin: Boolean(isOrganizationAdmin),
      query,
    };

    try {
      const rows = await this.query(report, context);
      return rows.map(normalizeScalar);
    } catch (error) {
      throw translateError(error, report);
    }
  }

  async query(report, context) {
    const { organizationId, actorUserId, isOrganizationAdmin, query } = context;
    const grain = query?.grain || 'month';
    const org = (alias) => organizationClause(alias, organizationId);
    const actor = (alias) => actorClause(alias, actorUserId, isOrganizationAdmin);
    const period = (expression) => periodClause(expression, query);
    const limited = limitClause(query);

    switch (report) {
      case 'farmer.production':
        return this.prisma.$queryRaw`
          SELECT ${bucket('h.harvested_at', grain)} AS period_start,
                 COALESCE(c.name, cv.name, 'Unclassified') AS dimension,
                 SUM(h.quantity_kg)::float8 AS value,
                 COUNT(*)::int AS records,
                 SUM(CASE WHEN h.status IN ('CONFIRMED', 'RECONCILED')
                          THEN h.quantity_kg ELSE 0 END)::float8 AS confirmed_value
          FROM harvests h
          JOIN farms f ON f.id = h.farm_id
          JOIN cultivations cu ON cu.id = h.cultivation_id
          LEFT JOIN crop_varieties cv ON cv.id = cu.crop_variety_id
          LEFT JOIN crops c ON c.id = COALESCE(cu.crop_id, cv.crop_id)
          WHERE TRUE ${org('h.organization_id')} ${actor('f.owner_user_id')}
                 ${period('h.harvested_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'farmer.crop-yield':
        return this.prisma.$queryRaw`
          WITH cultivation_yield AS (
            SELECT cu.id AS cultivation_id,
                   ${bucket('COALESCE(h.harvested_at, cu.harvested_at, cu.expected_harvest_at)', grain)} AS period_start,
                   COALESCE(c.name, cv.name, 'Unclassified') AS dimension,
                   SUM(COALESCE(h.quantity_kg, 0))::float8 AS quantity_kg,
                   MAX(cu.area_hectares)::float8 AS area_hectares
            FROM cultivations cu
            JOIN farms f ON f.id = cu.farm_id
            LEFT JOIN harvests h ON h.cultivation_id = cu.id
            LEFT JOIN crop_varieties cv ON cv.id = cu.crop_variety_id
            LEFT JOIN crops c ON c.id = COALESCE(cu.crop_id, cv.crop_id)
            WHERE TRUE ${org('cu.organization_id')} ${actor('f.owner_user_id')}
                   ${period('COALESCE(h.harvested_at, cu.harvested_at, cu.expected_harvest_at)')}
            GROUP BY cu.id, 2, 3
          )
          SELECT period_start,
                 dimension,
                 CASE WHEN SUM(area_hectares) > 0
                      THEN SUM(quantity_kg) / SUM(area_hectares) ELSE 0 END::float8 AS value,
                 SUM(quantity_kg)::float8 AS quantity_kg,
                 SUM(area_hectares)::float8 AS area_hectares,
                 COUNT(*)::int AS records
          FROM cultivation_yield
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'farmer.cultivation-expenses':
        return this.prisma.$queryRaw`
          SELECT ${bucket('fe.expense_date', grain)} AS period_start,
                 fe.category::text AS dimension,
                 SUM(CASE WHEN fe.source = 'RECORDED'
                          THEN fe.amount ELSE 0 END)::float8 AS value,
                 SUM(CASE WHEN fe.source = 'AI_ESTIMATED'
                          THEN fe.amount ELSE 0 END)::float8 AS ai_estimated_value,
                 COUNT(*)::int AS records
          FROM farm_expenses fe
          JOIN farms f ON f.id = fe.farm_id
          WHERE TRUE ${org('fe.organization_id')} ${actor('f.owner_user_id')}
                 ${period('fe.expense_date')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'farmer.profitability':
        return this.prisma.$queryRaw`
          WITH revenue AS (
            SELECT ${bucket('o.placed_at', grain)} AS period_start,
                   SUM(oi.line_total)::float8 AS revenue,
                   COUNT(DISTINCT o.id)::int AS orders
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE TRUE ${org('o.organization_id')} ${actor('o.seller_user_id')}
                   ${period('o.placed_at')}
            GROUP BY 1
          ), costs AS (
            SELECT ${bucket('fe.expense_date', grain)} AS period_start,
                   SUM(fe.amount)::float8 AS cost,
                   COUNT(*)::int AS expense_records
            FROM farm_expenses fe
            JOIN farms f ON f.id = fe.farm_id
            WHERE TRUE ${org('fe.organization_id')} ${actor('f.owner_user_id')}
                   ${period('fe.expense_date')}
                   AND fe.source = 'RECORDED'
            GROUP BY 1
          )
          SELECT COALESCE(r.period_start, c.period_start) AS period_start,
                 'Net profit' AS dimension,
                 (COALESCE(r.revenue, 0) - COALESCE(c.cost, 0))::float8 AS value,
                 COALESCE(r.revenue, 0)::float8 AS revenue,
                 COALESCE(c.cost, 0)::float8 AS cost,
                 (COALESCE(r.orders, 0) + COALESCE(c.expense_records, 0))::int AS records
          FROM revenue r
          FULL OUTER JOIN costs c ON r.period_start = c.period_start
          ORDER BY 1
          ${limited}
        `;

      case 'farmer.sales':
      case 'seller.sales-performance':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 o.status::text AS dimension,
                 SUM(o.total_amount)::float8 AS value,
                 COUNT(*)::int AS records
          FROM orders o
          WHERE TRUE ${org('o.organization_id')} ${actor('o.seller_user_id')}
                 ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'buyer.purchase-history':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 o.status::text AS dimension,
                 SUM(o.total_amount)::float8 AS value,
                 COUNT(*)::int AS records
          FROM orders o
          WHERE TRUE ${org('o.organization_id')} ${actor('o.buyer_user_id')}
                 ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'buyer.spending':
        return this.prisma.$queryRaw`
          SELECT ${bucket('p.captured_at', grain)} AS period_start,
                 o.status::text AS dimension,
                 SUM(p.captured_amount)::float8 AS value,
                 COUNT(*)::int AS records
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          WHERE TRUE ${org('p.organization_id')} ${actor('o.buyer_user_id')}
                 ${period('p.captured_at')}
                 AND p.status = 'CAPTURED'
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'buyer.supplier-performance':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 COALESCE(
                   NULLIF(TRIM(CONCAT_WS(' ', up.first_name, up.last_name)), ''),
                   u.email,
                   u.phone,
                   'Unknown supplier'
                 ) AS dimension,
                 SUM(o.total_amount)::float8 AS value,
                 COUNT(DISTINCT o.id)::int AS records,
                 (COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'DELIVERED'))::int AS delivered_orders,
                 CAST(AVG(EXTRACT(EPOCH FROM (s.delivered_at - o.placed_at)) / 86400)
                      FILTER (WHERE s.delivered_at IS NOT NULL) AS double precision) AS avg_delivery_days
          FROM orders o
          JOIN users u ON u.id = o.seller_user_id
          LEFT JOIN user_profiles up ON up.user_id = u.id
          LEFT JOIN shipments s ON s.order_id = o.id
          WHERE TRUE ${org('o.organization_id')} ${actor('o.buyer_user_id')}
                 ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'buyer.product-trends':
      case 'platform.product-demand':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 p.name AS dimension,
                 SUM(oi.line_total)::float8 AS value,
                 SUM(oi.quantity)::float8 AS units,
                 COUNT(*)::int AS records
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN products p ON p.id = oi.product_id
          WHERE TRUE ${org('o.organization_id')} ${actor('o.buyer_user_id')}
                 ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'seller.inventory':
        return this.prisma.$queryRaw`
          SELECT ${bucket('pi.updated_at', grain)} AS period_start,
                 p.name AS dimension,
                 SUM(pi.available_quantity)::float8 AS value,
                 COUNT(*)::int AS records,
                 SUM(CASE WHEN pi.available_quantity <= 0 THEN 1 ELSE 0 END)::int AS out_of_stock_records
          FROM product_inventories pi
          JOIN products p ON p.id = pi.product_id
          WHERE TRUE ${org('pi.organization_id')}
                 ${period('pi.updated_at')}
                 AND (
                   ${
                     isOrganizationAdmin
                       ? Prisma.sql`TRUE`
                       : Prisma.sql`EXISTS (
                     SELECT 1 FROM product_listings pl
                     WHERE pl.product_id = pi.product_id
                       AND pl.seller_user_id = ${actorUserId}::uuid
                   )`
                   }
                 )
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'seller.order-fulfillment':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 o.status::text AS dimension,
                 COUNT(*)::int AS value,
                 (COUNT(*) FILTER (WHERE s.status = 'DELIVERED'))::int AS delivered_orders,
                 CAST(AVG(EXTRACT(EPOCH FROM (s.delivered_at - o.placed_at)) / 86400)
                      FILTER (WHERE s.delivered_at IS NOT NULL) AS double precision) AS avg_delivery_days,
                 COUNT(*)::int AS records
          FROM orders o
          LEFT JOIN shipments s ON s.order_id = o.id
          WHERE TRUE ${org('o.organization_id')} ${actor('o.seller_user_id')}
                 ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'seller.revenue':
        return this.prisma.$queryRaw`
          SELECT ${bucket('p.captured_at', grain)} AS period_start,
                 p.status::text AS dimension,
                 SUM(p.captured_amount - p.refunded_amount)::float8 AS value,
                 COUNT(*)::int AS records
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          WHERE TRUE ${org('p.organization_id')} ${actor('o.seller_user_id')}
                 ${period('p.captured_at')}
                 AND p.status IN ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.user-growth':
        return this.prisma.$queryRaw`
          SELECT ${bucket('u.created_at', grain)} AS period_start,
                 u.account_status::text AS dimension,
                 COUNT(*)::int AS value,
                 COUNT(*)::int AS records
          FROM users u
          WHERE TRUE ${period('u.created_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.marketplace-activity':
        return this.prisma.$queryRaw`
          SELECT ${bucket('pl.created_at', grain)} AS period_start,
                 pl.status::text AS dimension,
                 COUNT(*)::int AS value,
                 COUNT(*)::int AS records
          FROM product_listings pl
          WHERE TRUE ${period('pl.created_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.order-volume':
        return this.prisma.$queryRaw`
          SELECT ${bucket('o.placed_at', grain)} AS period_start,
                 o.status::text AS dimension,
                 COUNT(*)::int AS value,
                 COUNT(*)::int AS records
          FROM orders o
          WHERE TRUE ${period('o.placed_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.regional-activity':
        return this.prisma.$queryRaw`
          WITH regional AS (
            SELECT ${bucket('pl.created_at', grain)} AS period_start,
                   d.name AS dimension,
                   COUNT(*)::int AS value
            FROM product_listings pl
            JOIN listing_locations ll ON ll.listing_id = pl.id
            LEFT JOIN divisions d ON d.id = ll.division_id
            WHERE TRUE ${period('pl.created_at')}
            GROUP BY 1, 2
            UNION ALL
            SELECT ${bucket('f.created_at', grain)} AS period_start,
                   d.name AS dimension,
                   COUNT(*)::int AS value
            FROM farms f
            JOIN farm_locations fl ON fl.farm_id = f.id
            LEFT JOIN divisions d ON d.id = fl.division_id
            WHERE TRUE ${period('f.created_at')}
            GROUP BY 1, 2
          )
          SELECT period_start,
                 COALESCE(dimension, 'Unspecified') AS dimension,
                 SUM(value)::float8 AS value,
                 COUNT(*)::int AS records
          FROM regional
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.revenue':
        return this.prisma.$queryRaw`
          SELECT ${bucket('p.captured_at', grain)} AS period_start,
                 p.status::text AS dimension,
                 SUM(p.captured_amount - p.refunded_amount)::float8 AS value,
                 COUNT(*)::int AS records
          FROM payments p
          WHERE TRUE ${period('p.captured_at')}
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      case 'platform.ai-usage':
        return this.prisma.$queryRaw`
          WITH usage AS (
            SELECT ${bucket('ar.created_at', grain)} AS period_start,
                   'recommendation' AS dimension
            FROM ai_recommendations ar
            WHERE TRUE ${period('ar.created_at')}
            UNION ALL
            SELECT ${bucket('ae.created_at', grain)} AS period_start,
                   'agent_execution' AS dimension
            FROM agent_executions ae
            WHERE TRUE ${period('ae.created_at')}
            UNION ALL
            SELECT ${bucket('af.created_at', grain)} AS period_start,
                   'feedback' AS dimension
            FROM ai_feedback af
            WHERE TRUE ${period('af.created_at')}
          )
          SELECT period_start,
                 dimension,
                 COUNT(*)::float8 AS value,
                 COUNT(*)::int AS records
          FROM usage
          GROUP BY 1, 2
          ORDER BY 1, 2
          ${limited}
        `;

      default:
        throw new InfrastructureError({
          message: `No SQL report is registered for '${report}'.`,
          details: { code: 'unknown_analytics_report', report },
        });
    }
  }
}

module.exports = { AnalyticsPrismaStore };
