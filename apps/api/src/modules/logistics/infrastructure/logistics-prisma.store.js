const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { LOGISTICS_STORE_METHODS, LogisticsStoreToken } = require('../domain/logistics.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A logistics reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Logistics record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23514', '23503', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Logistics operation was rejected.',
      });
    }
  }
  return error;
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = normalize(item);
    return result;
  }
  return value;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === 'since') {
      where.created_at = { ...(where.created_at || {}), gte: value };
    } else if (key === 'until') {
      where.created_at = { ...(where.created_at || {}), lte: value };
    } else if (Array.isArray(value)) {
      where[key] = { in: value };
    } else {
      where[key] = value;
    }
  }
  return where;
}

/** Prisma adapter for logistics records. Coordinates are always supplied by callers. */
class LogisticsPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('LogisticsPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, LOGISTICS_STORE_METHODS, LogisticsStoreToken);
  }

  async _find(delegate, id) {
    const record = await delegate.findUnique({ where: { id } });
    return record ? normalize(record) : null;
  }

  async _list(delegate, filters) {
    const records = await delegate.findMany({
      where: whereFrom(filters),
      orderBy: { created_at: 'desc' },
    });
    return records.map(normalize);
  }

  async _create(delegate, input) {
    try {
      return normalize(await delegate.create({ data: input }));
    } catch (error) {
      throw translateError(error);
    }
  }

  async _update(delegate, id, patch) {
    try {
      return normalize(await delegate.update({ where: { id }, data: patch }));
    } catch (error) {
      throw translateError(error);
    }
  }

  listProviders(filters) {
    return this._list(this.prisma.logisticsProvider, filters);
  }

  findProvider(id) {
    return this._find(this.prisma.logisticsProvider, id);
  }

  createProvider(input) {
    return this._create(this.prisma.logisticsProvider, input);
  }

  updateProvider(id, patch) {
    return this._update(this.prisma.logisticsProvider, id, patch);
  }

  listServices(filters) {
    return this._list(this.prisma.deliveryService, filters);
  }

  findService(id) {
    return this._find(this.prisma.deliveryService, id);
  }

  createService(input) {
    return this._create(this.prisma.deliveryService, input);
  }

  updateService(id, patch) {
    return this._update(this.prisma.deliveryService, id, patch);
  }

  listShipments(filters) {
    return this._list(this.prisma.shipment, filters);
  }

  findShipment(id) {
    return this._find(this.prisma.shipment, id);
  }

  createShipment(input) {
    return this._create(this.prisma.shipment, input);
  }

  updateShipment(id, patch) {
    return this._update(this.prisma.shipment, id, patch);
  }

  listDeliveries(filters) {
    return this._list(this.prisma.delivery, {
      ...filters,
      ...(filters?.orderBy ? {} : {}),
    });
  }

  findDelivery(id) {
    return this._find(this.prisma.delivery, id);
  }

  async findDeliveryByAttempt(shipmentId, attemptNumber) {
    const record = await this.prisma.delivery.findUnique({
      where: {
        shipment_id_attempt_number: { shipment_id: shipmentId, attempt_number: attemptNumber },
      },
    });
    return record ? normalize(record) : null;
  }

  createDelivery(input) {
    return this._create(this.prisma.delivery, input);
  }

  updateDelivery(id, patch) {
    return this._update(this.prisma.delivery, id, patch);
  }

  listRoutes(filters) {
    return this._list(this.prisma.shipmentRoute, filters);
  }

  async findRouteByShipment(shipmentId) {
    const record = await this.prisma.shipmentRoute.findUnique({
      where: { shipment_id: shipmentId },
    });
    return record ? normalize(record) : null;
  }

  async upsertRoute(input) {
    try {
      const { shipment_id, ...patch } = input;
      const record = await this.prisma.shipmentRoute.upsert({
        where: { shipment_id },
        create: input,
        update: patch,
      });
      return normalize(record);
    } catch (error) {
      throw translateError(error);
    }
  }

  listEvents(filters) {
    return this._list(this.prisma.shipmentEvent, filters);
  }

  createEvent(input) {
    return this._create(this.prisma.shipmentEvent, input);
  }

  listAudits(filters) {
    return this._list(this.prisma.deliveryAuditEvent, filters);
  }

  createAudit(input) {
    return this._create(this.prisma.deliveryAuditEvent, input);
  }

  async distanceKm(fromLongitude, fromLatitude, toLongitude, toLatitude) {
    const rows = await this.prisma.$queryRaw`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${fromLongitude}::double precision, ${fromLatitude}::double precision), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${toLongitude}::double precision, ${toLatitude}::double precision), 4326)::geography
      ) / 1000 AS "distanceKm"
    `;
    return Number(Number(rows[0]?.distanceKm || 0).toFixed(3));
  }

  async nearbyProviders({ longitude, latitude, radiusKm, serviceType }) {
    try {
      const rows = await this.prisma.$queryRaw`
        SELECT p.*,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography
          ) / 1000 AS "distance_km"
        FROM logistics_providers p
        WHERE p.is_active = true
          AND p.longitude IS NOT NULL
          AND p.latitude IS NOT NULL
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326)::geography,
            ${radiusKm} * 1000
          )
          AND (${serviceType || null}::text IS NULL OR p.service_types @> to_jsonb(${serviceType || null}::text))
        ORDER BY "distance_km" ASC
      `;
      return rows.map((row) => {
        const { distance_km, ...provider } = normalize(row);
        return { provider, distanceKm: Number(distance_km) };
      });
    } catch (error) {
      throw translateError(error);
    }
  }
}

module.exports = { LogisticsPrismaStore };
