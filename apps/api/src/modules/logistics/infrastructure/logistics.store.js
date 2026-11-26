const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { LOGISTICS_STORE_METHODS, LogisticsStoreToken } = require('../domain/logistics.repository');

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return new Date();
}

function matches(record, filters) {
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'since') return record.created_at >= value;
    if (key === 'until') return record.created_at <= value;
    if (Array.isArray(value)) return value.includes(record[key]);
    return record[key] === value;
  });
}

function haversineKm(fromLon, fromLat, toLon, toLat) {
  if (
    [fromLon, fromLat, toLon, toLat].some(
      (value) => typeof value !== 'number' || !Number.isFinite(value),
    )
  ) {
    return null;
  }
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLon / 2) ** 2;
  return Number((6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))).toFixed(3));
}

/** In-process logistics store mirroring the Prisma adapter's record shape. */
class LogisticsInMemoryStore {
  constructor() {
    this.providers = new Map();
    this.services = new Map();
    this.shipments = new Map();
    this.deliveries = new Map();
    this.routes = new Map();
    this.events = new Map();
    this.audits = new Map();
    this.shipmentReferences = new Set();
    assertRepository(this, LOGISTICS_STORE_METHODS, LogisticsStoreToken);
  }

  _insert(collection, input) {
    const timestamp = now();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : timestamp,
      updated_at: input.updated_at ? new Date(input.updated_at) : timestamp,
    };
    collection.set(record.id, clone(record));
    return clone(record);
  }

  _update(collection, id, patch) {
    const record = collection.get(id);
    if (!record) throw new NotFoundError({ message: 'Logistics record was not found.' });
    const updated = { ...record, ...patch, updated_at: now() };
    collection.set(id, clone(updated));
    return clone(updated);
  }

  listProviders(filters) {
    return Promise.resolve(
      [...this.providers.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findProvider(id) {
    return Promise.resolve(clone(this.providers.get(id) || null));
  }

  createProvider(input) {
    return Promise.resolve(this._insert(this.providers, input));
  }

  updateProvider(id, patch) {
    return Promise.resolve(this._update(this.providers, id, patch));
  }

  listServices(filters) {
    return Promise.resolve(
      [...this.services.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findService(id) {
    return Promise.resolve(clone(this.services.get(id) || null));
  }

  createService(input) {
    return Promise.resolve(this._insert(this.services, input));
  }

  updateService(id, patch) {
    return Promise.resolve(this._update(this.services, id, patch));
  }

  listShipments(filters) {
    return Promise.resolve(
      [...this.shipments.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  findShipment(id) {
    return Promise.resolve(clone(this.shipments.get(id) || null));
  }

  createShipment(input) {
    if (input.reference_key && this.shipmentReferences.has(input.reference_key)) {
      throw new ConflictError({ message: 'Shipment reference key is already in use.' });
    }
    const shipment = this._insert(this.shipments, input);
    if (shipment.reference_key) this.shipmentReferences.add(shipment.reference_key);
    return Promise.resolve(shipment);
  }

  updateShipment(id, patch) {
    return Promise.resolve(this._update(this.shipments, id, patch));
  }

  listDeliveries(filters) {
    return Promise.resolve(
      [...this.deliveries.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.attempt_number - a.attempt_number)
        .map(clone),
    );
  }

  findDelivery(id) {
    return Promise.resolve(clone(this.deliveries.get(id) || null));
  }

  findDeliveryByAttempt(shipmentId, attemptNumber) {
    const record = [...this.deliveries.values()].find(
      (item) => item.shipment_id === shipmentId && item.attempt_number === attemptNumber,
    );
    return Promise.resolve(clone(record || null));
  }

  createDelivery(input) {
    return Promise.resolve(this._insert(this.deliveries, input));
  }

  updateDelivery(id, patch) {
    return Promise.resolve(this._update(this.deliveries, id, patch));
  }

  listRoutes(filters) {
    return Promise.resolve(
      [...this.routes.values()].filter((record) => matches(record, filters)).map(clone),
    );
  }

  findRouteByShipment(shipmentId) {
    const route = [...this.routes.values()].find((item) => item.shipment_id === shipmentId);
    return Promise.resolve(clone(route || null));
  }

  upsertRoute(input) {
    const existing = [...this.routes.values()].find(
      (item) => item.shipment_id === input.shipment_id,
    );
    if (!existing) return Promise.resolve(this._insert(this.routes, input));
    return Promise.resolve(this._update(this.routes, existing.id, input));
  }

  listEvents(filters) {
    return Promise.resolve(
      [...this.events.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())
        .map(clone),
    );
  }

  createEvent(input) {
    return Promise.resolve(this._insert(this.events, input));
  }

  listAudits(filters) {
    return Promise.resolve(
      [...this.audits.values()]
        .filter((record) => matches(record, filters))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map(clone),
    );
  }

  createAudit(input) {
    return Promise.resolve(this._insert(this.audits, input));
  }

  distanceKm(fromLongitude, fromLatitude, toLongitude, toLatitude) {
    return Promise.resolve(haversineKm(fromLongitude, fromLatitude, toLongitude, toLatitude));
  }

  nearbyProviders({ longitude, latitude, radiusKm, serviceType }) {
    const providers = [...this.providers.values()].filter((provider) => {
      if (provider.is_active === false) return false;
      if (serviceType && !(provider.service_types || []).includes(serviceType)) return false;
      const distance = haversineKm(
        Number(provider.longitude),
        Number(provider.latitude),
        longitude,
        latitude,
      );
      return distance !== null && distance <= radiusKm;
    });
    return Promise.resolve(
      providers
        .map((provider) => ({
          provider: clone(provider),
          distanceKm: haversineKm(
            Number(provider.longitude),
            Number(provider.latitude),
            longitude,
            latitude,
          ),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm),
    );
  }
}

module.exports = { LogisticsInMemoryStore, haversineKm };
