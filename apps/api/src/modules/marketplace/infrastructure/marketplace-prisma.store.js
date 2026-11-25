const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const {
  MARKETPLACE_STORE_METHODS,
  MarketplaceStoreToken,
} = require('../domain/marketplace.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'A marketplace record is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Marketplace record was not found.' });
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
    where[key] = Array.isArray(value) ? { in: value } : value;
  }
  return where;
}

function normalizeLocationRow(row) {
  if (!row) return null;
  let location = row.location ?? null;
  if (typeof location === 'string') {
    try {
      location = JSON.parse(location);
    } catch {
      location = null;
    }
  }
  if (location && typeof location === 'object') {
    location = {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  }
  return normalize({ ...row, location });
}

/**
 * Prisma implementation of the marketplace store. PostGIS geometry is managed
 * through parameterized raw SQL because the Prisma client cannot write the
 * Unsupported geometry column directly.
 */
class MarketplacePrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('MarketplacePrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, MARKETPLACE_STORE_METHODS, MarketplaceStoreToken);
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

  async _delete(delegate, id) {
    try {
      await delegate.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error?.code === 'P2025') return false;
      throw translateError(error);
    }
  }

  listListings(filters) {
    return this._list(this.prisma.productListing, filters);
  }

  findListing(id) {
    return this._find(this.prisma.productListing, id);
  }

  createListing(input) {
    return this._create(this.prisma.productListing, input);
  }

  updateListing(id, patch) {
    return this._update(this.prisma.productListing, id, patch);
  }

  async listLocations(filters = {}) {
    const rows = await this.prisma.$queryRaw`
      SELECT
        id,
        listing_id,
        division_id,
        district_id,
        upazila_id,
        union_id,
        location_label,
        radius_meters,
        created_at,
        updated_at,
        CASE WHEN location IS NULL THEN NULL ELSE json_build_object(
          'latitude', ST_Y(location),
          'longitude', ST_X(location)
        ) END AS location
      FROM listing_locations
      ORDER BY created_at DESC
    `;
    return rows.map(normalizeLocationRow).filter((row) =>
      Object.entries(filters).every(([key, value]) => {
        if (value === undefined) return true;
        return Array.isArray(value) ? value.includes(row[key]) : row[key] === value;
      }),
    );
  }

  async findLocation(id) {
    const rows = await this.prisma.$queryRaw`
      SELECT
        id,
        listing_id,
        division_id,
        district_id,
        upazila_id,
        union_id,
        location_label,
        radius_meters,
        created_at,
        updated_at,
        CASE WHEN location IS NULL THEN NULL ELSE json_build_object(
          'latitude', ST_Y(location),
          'longitude', ST_X(location)
        ) END AS location
      FROM listing_locations
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows.length > 0 ? normalizeLocationRow(rows[0]) : null;
  }

  async createLocation(input) {
    const { location, ...data } = input;
    const record = await this._create(this.prisma.listingLocation, data);
    if (location) {
      await this.prisma.$executeRaw`
        UPDATE listing_locations
        SET location = ST_SetSRID(ST_MakePoint(${location.longitude}::float8, ${location.latitude}::float8), 4326)
        WHERE id = ${record.id}::uuid
      `;
    }
    return this.findLocation(record.id);
  }

  deleteLocation(id) {
    return this._delete(this.prisma.listingLocation, id);
  }

  listImages(filters) {
    return this._list(this.prisma.listingImage, filters);
  }

  findImage(id) {
    return this._find(this.prisma.listingImage, id);
  }

  createImage(input) {
    return this._create(this.prisma.listingImage, input);
  }

  deleteImage(id) {
    return this._delete(this.prisma.listingImage, id);
  }

  listFavorites(filters) {
    return this._list(this.prisma.favoriteListing, filters);
  }

  async findFavorite(userId, listingId) {
    const record = await this.prisma.favoriteListing.findUnique({
      where: { user_id_listing_id: { user_id: userId, listing_id: listingId } },
    });
    return record ? normalize(record) : null;
  }

  createFavorite(input) {
    return this._create(this.prisma.favoriteListing, input);
  }

  async deleteFavorite(userId, listingId) {
    const result = await this.prisma.favoriteListing.deleteMany({
      where: { user_id: userId, listing_id: listingId },
    });
    return result.count > 0;
  }

  listReports(filters) {
    return this._list(this.prisma.listingReport, filters);
  }

  findReport(id) {
    return this._find(this.prisma.listingReport, id);
  }

  createReport(input) {
    return this._create(this.prisma.listingReport, input);
  }

  updateReport(id, patch) {
    return this._update(this.prisma.listingReport, id, patch);
  }

  listMessages(filters) {
    return this._list(this.prisma.listingMessage, filters);
  }

  findMessage(id) {
    return this._find(this.prisma.listingMessage, id);
  }

  createMessage(input) {
    return this._create(this.prisma.listingMessage, input);
  }

  updateMessage(id, patch) {
    return this._update(this.prisma.listingMessage, id, patch);
  }

  async searchNearby({ latitude, longitude, radiusMeters, listingIds, statuses }) {
    const rows = await this.prisma.$queryRaw`
      SELECT
        listing_locations.id AS location_id,
        listing_locations.listing_id,
        product_listings.status AS status,
        ST_Distance(
          listing_locations.location::geography,
          ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)::geography
        ) AS distance_meters
      FROM listing_locations
      JOIN product_listings ON product_listings.id = listing_locations.listing_id
      WHERE listing_locations.location IS NOT NULL
        AND ST_DWithin(
          listing_locations.location::geography,
          ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326)::geography,
          ${radiusMeters}::float8
        )
      ORDER BY distance_meters ASC
    `;

    const allowedListings = listingIds ? new Set(listingIds) : null;
    const allowedStatuses = statuses ? new Set(statuses) : null;
    return rows
      .map((row) => normalize(row))
      .filter(
        (row) =>
          (!allowedListings || allowedListings.has(row.listing_id)) &&
          (!allowedStatuses || allowedStatuses.has(row.status)),
      )
      .map((row) => ({
        listing_id: row.listing_id,
        location_id: row.location_id,
        distance_meters: Number(row.distance_meters),
      }));
  }
}

module.exports = { MarketplacePrismaStore };
