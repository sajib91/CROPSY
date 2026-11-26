const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const {
  MARKETPLACE_STORE_METHODS,
  MarketplaceStoreToken,
} = require('../domain/marketplace.repository');

const COLLECTIONS = Object.freeze([
  'listings',
  'locations',
  'images',
  'favorites',
  'reports',
  'messages',
]);

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(left, right) {
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * In-process marketplace store. Records use snake_case columns and Date
 * values, matching the Prisma adapter.
 */
class MarketplaceInMemoryStore {
  constructor() {
    for (const name of COLLECTIONS) this[name] = new Map();
    assertRepository(this, MARKETPLACE_STORE_METHODS, MarketplaceStoreToken);
  }

  _insert(collection, input) {
    const now = new Date();
    const record = {
      ...input,
      id: input.id || randomUUID(),
      created_at: input.created_at ? new Date(input.created_at) : now,
      updated_at: input.updated_at ? new Date(input.updated_at) : now,
    };
    this[collection].set(record.id, record);
    return copy(record);
  }

  _find(collection, id) {
    return copy(this[collection].get(id));
  }

  _update(collection, id, patch) {
    const record = this[collection].get(id);
    if (!record) return null;
    Object.assign(record, patch, { updated_at: new Date() });
    return copy(record);
  }

  _delete(collection, id) {
    return this[collection].delete(id);
  }

  _list(collection, filters = {}) {
    let rows = [...this[collection].values()];
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      rows = rows.filter((row) =>
        Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
      );
    }
    rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return rows.map(copy);
  }

  listListings(filters) {
    return Promise.resolve(this._list('listings', filters));
  }

  findListing(id) {
    return Promise.resolve(this._find('listings', id));
  }

  createListing(input) {
    return Promise.resolve(this._insert('listings', input));
  }

  updateListing(id, patch) {
    return Promise.resolve(this._update('listings', id, patch));
  }

  decrementAvailability(id, quantity) {
    const listing = this.listings.get(id);
    if (!listing) {
      return Promise.reject(new NotFoundError({ message: 'Listing was not found.' }));
    }
    if (Number(listing.quantity_available) < quantity) {
      return Promise.reject(new ConflictError({ message: 'Insufficient listing availability.' }));
    }
    listing.quantity_available = Number(listing.quantity_available) - quantity;
    listing.updated_at = new Date();
    return Promise.resolve(copy(listing));
  }

  restoreAvailability(id, quantity) {
    const listing = this.listings.get(id);
    if (!listing) {
      return Promise.reject(new NotFoundError({ message: 'Listing was not found.' }));
    }
    listing.quantity_available = Number(listing.quantity_available) + quantity;
    listing.updated_at = new Date();
    return Promise.resolve(copy(listing));
  }

  listLocations(filters) {
    return Promise.resolve(this._list('locations', filters));
  }

  findLocation(id) {
    return Promise.resolve(this._find('locations', id));
  }

  createLocation(input) {
    return Promise.resolve(this._insert('locations', input));
  }

  deleteLocation(id) {
    return Promise.resolve(this._delete('locations', id));
  }

  listImages(filters) {
    return Promise.resolve(this._list('images', filters));
  }

  findImage(id) {
    return Promise.resolve(this._find('images', id));
  }

  createImage(input) {
    return Promise.resolve(this._insert('images', input));
  }

  deleteImage(id) {
    return Promise.resolve(this._delete('images', id));
  }

  listFavorites(filters) {
    return Promise.resolve(this._list('favorites', filters));
  }

  findFavorite(userId, listingId) {
    const favorite = [...this.favorites.values()].find(
      (row) => row.user_id === userId && row.listing_id === listingId,
    );
    return Promise.resolve(copy(favorite));
  }

  createFavorite(input) {
    return Promise.resolve(this._insert('favorites', input));
  }

  deleteFavorite(userId, listingId) {
    for (const [id, row] of this.favorites) {
      if (row.user_id === userId && row.listing_id === listingId) {
        this.favorites.delete(id);
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  }

  listReports(filters) {
    return Promise.resolve(this._list('reports', filters));
  }

  findReport(id) {
    return Promise.resolve(this._find('reports', id));
  }

  createReport(input) {
    return Promise.resolve(this._insert('reports', input));
  }

  updateReport(id, patch) {
    return Promise.resolve(this._update('reports', id, patch));
  }

  listMessages(filters) {
    return Promise.resolve(this._list('messages', filters));
  }

  findMessage(id) {
    return Promise.resolve(this._find('messages', id));
  }

  createMessage(input) {
    return Promise.resolve(this._insert('messages', input));
  }

  updateMessage(id, patch) {
    return Promise.resolve(this._update('messages', id, patch));
  }

  searchNearby({ latitude, longitude, radiusMeters, listingIds, statuses }) {
    const allowedListings = listingIds ? new Set(listingIds) : null;
    const allowedStatuses = statuses ? new Set(statuses) : null;
    const origin = { latitude, longitude };
    const results = [];

    for (const location of this.locations.values()) {
      if (!location.location) continue;
      if (allowedListings && !allowedListings.has(location.listing_id)) continue;
      const listing = this.listings.get(location.listing_id);
      if (!listing) continue;
      if (allowedStatuses && !allowedStatuses.has(listing.status)) continue;
      const distanceMeters = haversineMeters(origin, location.location);
      if (distanceMeters > radiusMeters) continue;
      results.push({
        listing_id: location.listing_id,
        location_id: location.id,
        distance_meters: distanceMeters,
      });
    }

    results.sort((left, right) => left.distance_meters - right.distance_meters);
    return Promise.resolve(results);
  }
}

module.exports = { MarketplaceInMemoryStore, haversineMeters };
