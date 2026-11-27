const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('./marketplace.dto');
const { MODULE_ID, MarketplaceEntity } = require('../domain/marketplace.entity');
const {
  MARKETPLACE_STORE_METHODS,
  MarketplaceRepositoryToken,
  MarketplaceStoreToken,
} = require('../domain/marketplace.repository');

const MarketplaceServiceToken = Symbol.for('cropsy.service.marketplace');

const EVENTS = Object.freeze({
  INITIALIZED: 'marketplace.initialized',
  LISTING_CREATED: 'marketplace.listing.created',
  LISTING_UPDATED: 'marketplace.listing.updated',
  LISTING_PUBLISHED: 'marketplace.listing.published',
  LISTING_DEACTIVATED: 'marketplace.listing.deactivated',
  LOCATION_ADDED: 'marketplace.listing.location-added',
  LOCATION_REMOVED: 'marketplace.listing.location-removed',
  IMAGE_ADDED: 'marketplace.listing.image-added',
  IMAGE_REMOVED: 'marketplace.listing.image-removed',
  FAVORITE_ADDED: 'marketplace.favorite.added',
  FAVORITE_REMOVED: 'marketplace.favorite.removed',
  REPORT_CREATED: 'marketplace.report.created',
  REPORT_REVIEWED: 'marketplace.report.reviewed',
  MESSAGE_SENT: 'marketplace.message.sent',
  MESSAGE_READ: 'marketplace.message.read',
});

const CATALOG_PORT_METHODS = Object.freeze([
  'findProduct',
  'findCategory',
  'findUnit',
  'findQualityGrade',
  'listProductImages',
  'listProducts',
  'listCategories',
]);

const IDENTITY_METHODS = Object.freeze([
  'appendAudit',
  'findUserById',
  'findUserProfile',
  'findFarmerProfile',
  'listOrganizationMemberships',
  'findOrganization',
]);

function requestMeta(request) {
  return {
    ipAddress: request?.ip || null,
    userAgent: request?.headers?.['user-agent'] || null,
    requestId: request?.requestId || null,
  };
}

function requireRecord(record, label) {
  if (!record) throw new NotFoundError({ message: `${label} was not found.` });
  return record;
}

function parseDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError({ message: 'Date must use YYYY-MM-DD.' });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError({ message: 'Invalid date.' });
  return date;
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError({ message: 'Invalid timestamp.' });
  return date;
}

function matchesSearch(value, search) {
  if (!search) return true;
  return String(value || '')
    .toLowerCase()
    .includes(search.toLowerCase());
}

class MarketplaceService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    catalog,
    authorization,
    identityStore,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], MarketplaceRepositoryToken);
    assertRepository(store, MARKETPLACE_STORE_METHODS, MarketplaceStoreToken);
    assertRepository(catalog, CATALOG_PORT_METHODS, 'CatalogAccessPort');
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('MarketplaceService requires an event bus.');
    }
    if (!metadata) throw new TypeError('MarketplaceService requires module metadata.');
    for (const [name, dependency] of Object.entries({ store, authorization, config })) {
      if (!dependency) throw new TypeError(`MarketplaceService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.catalog = catalog;
    this.authorization = authorization;
    this.identityStore = identityStore;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new MarketplaceEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = dto.toModuleInfoDto(entity, this.metadata);
    return validate(dto.moduleInfoSchema, data, 'marketplace module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.listingId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, organizationId = null, before, after = {}, severity = 'INFO' },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: request?.auth?.user?.id || null,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.identityStore.appendAudit(entry);
    this.publish(action, entry.after, entityId);
  }

  async resolveTenantId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await this.authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) {
      throw new ForbiddenError({
        message: 'An active organization context is required.',
        details: { code: 'organization_context_required' },
      });
    }
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertSameTenant(record, organizationId, label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (record.organization_id !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  canView(context, listing) {
    if (listing.status === 'ACTIVE') return true;
    if (context.isSuperAdmin || listing.seller_user_id === context.user?.id) return true;
    return Boolean(
      listing.organization_id &&
      listing.organization_id === context.organizationId &&
      context.permissions?.includes('listings.manage'),
    );
  }

  assertCanView(context, listing) {
    if (!this.canView(context, listing)) {
      throw new NotFoundError({ message: 'Listing was not found.' });
    }
    return listing;
  }

  async assertCanWrite(context, listing) {
    requireRecord(listing, 'Listing');
    if (context.isSuperAdmin || listing.seller_user_id === context.user?.id) return listing;
    if (listing.organization_id) {
      await this.authorization.assertOrganization(context, listing.organization_id);
    }
    if (!this.canView(context, listing)) {
      throw new ForbiddenError({
        message: 'Access to this listing is denied.',
        details: { code: 'resource_ownership_denied' },
      });
    }
    return listing;
  }

  async requireProduct(context, productId, organizationId) {
    const product = requireRecord(await this.catalog.findProduct(productId), 'Product');
    this.assertSameTenant(product, organizationId, 'Product');
    if (product.organization_id !== null && product.organization_id !== organizationId) {
      throw new ForbiddenError({ message: 'Product belongs to another organization.' });
    }
    if (!context.isSuperAdmin && product.organization_id) {
      await this.authorization.assertOrganization(context, product.organization_id);
    }
    return product;
  }

  async requireGrade(qualityGradeId, organizationId) {
    if (!qualityGradeId) return null;
    const grade = requireRecord(
      await this.catalog.findQualityGrade(qualityGradeId),
      'Quality grade',
    );
    this.assertSameTenant(grade, organizationId, 'Quality grade');
    if (!grade.is_active) {
      throw new ValidationError({ message: 'The selected quality grade is inactive.' });
    }
    return grade;
  }

  async publicSeller(sellerUserId) {
    if (!sellerUserId) return null;
    const user = await this.identityStore.findUserById(sellerUserId);
    if (!user) return null;
    const [profile, memberships, farmerProfile] = await Promise.all([
      this.identityStore.findUserProfile(sellerUserId),
      this.identityStore.listOrganizationMemberships(sellerUserId),
      this.identityStore.findFarmerProfile(sellerUserId),
    ]);
    const membership =
      memberships.find((item) => item.status === 'ACTIVE') || memberships[0] || null;
    const organization = membership?.organization_id
      ? await this.identityStore.findOrganization(membership.organization_id)
      : null;
    return dto.toSellerDto({ user, profile, organization, farmerProfile });
  }

  async relatedForMany(listings, distanceById = new Map(), preloaded = {}) {
    const [allProducts, allCategories, allLocations, allImages] = await Promise.all([
      preloaded.products ?? this.catalog.listProducts(),
      preloaded.categories ?? this.catalog.listCategories(),
      preloaded.locations ?? this.store.listLocations(),
      preloaded.images ?? this.store.listImages(),
    ]);
    const productById = new Map(allProducts.map((item) => [item.id, item]));
    const categoryById = new Map(allCategories.map((item) => [item.id, item]));
    const locationsByListing = new Map();
    const imagesByListing = new Map();
    for (const location of allLocations) {
      if (!locationsByListing.has(location.listing_id))
        locationsByListing.set(location.listing_id, []);
      locationsByListing.get(location.listing_id).push(location);
    }
    for (const image of allImages) {
      if (!imagesByListing.has(image.listing_id)) imagesByListing.set(image.listing_id, []);
      imagesByListing.get(image.listing_id).push(image);
    }

    const sellerIds = [...new Set(listings.map((listing) => listing.seller_user_id))];
    const sellers = await Promise.all(sellerIds.map((id) => this.publicSeller(id)));
    const sellerById = new Map(sellerIds.map((id, index) => [id, sellers[index]]));

    const gradeIds = [
      ...new Set(listings.map((listing) => listing.quality_grade_id).filter(Boolean)),
    ];
    const grades = await Promise.all(gradeIds.map((id) => this.catalog.findQualityGrade(id)));
    const gradeById = new Map(gradeIds.map((id, index) => [id, grades[index]]));

    return listings.map((listing) => {
      const product = productById.get(listing.product_id);
      return dto.toListingDto(listing, {
        product,
        category: product ? categoryById.get(product.category_id) : null,
        qualityGrade: listing.quality_grade_id ? gradeById.get(listing.quality_grade_id) : null,
        seller: sellerById.get(listing.seller_user_id) || null,
        locations: locationsByListing.get(listing.id) || [],
        images: imagesByListing.get(listing.id) || [],
        distanceMeters: distanceById.get(listing.id) ?? null,
      });
    });
  }

  async relatedFor(listing, distanceMeters = null) {
    const [product, locationRows, imageRows] = await Promise.all([
      this.catalog.findProduct(listing.product_id),
      this.store.listLocations({ listing_id: listing.id }),
      this.store.listImages({ listing_id: listing.id }),
    ]);
    const category = product ? await this.catalog.findCategory(product.category_id) : null;
    const grade = listing.quality_grade_id
      ? await this.catalog.findQualityGrade(listing.quality_grade_id)
      : null;
    return dto.toListingDto(listing, {
      product,
      category,
      qualityGrade: grade,
      seller: await this.publicSeller(listing.seller_user_id),
      locations: locationRows,
      images: imageRows,
      distanceMeters,
    });
  }

  prepareLocations(locations, listingId, organizationId) {
    return locations.map((location) => ({
      id: randomUUID(),
      listing_id: listingId,
      organization_id: organizationId,
      division_id: location.divisionId || null,
      district_id: location.districtId || null,
      upazila_id: location.upazilaId || null,
      union_id: location.unionId || null,
      location_label: location.label || null,
      location:
        location.latitude !== undefined && location.longitude !== undefined
          ? { latitude: location.latitude, longitude: location.longitude }
          : null,
      radius_meters: location.radiusMeters ?? null,
    }));
  }

  prepareImages(images, listingId) {
    return images.map((image) => ({
      id: randomUUID(),
      listing_id: listingId,
      url: image.url,
      alt_text: image.altText || null,
      sort_order: image.sortOrder,
    }));
  }

  // ---------------------------------------------------------------------------
  // Listing discovery and seller-facing CRUD
  // ---------------------------------------------------------------------------

  async listListings({ context, query = {} }) {
    const value = validate(dto.listingQuerySchema, query, 'listing query');
    if (value.organizationId) {
      await this.authorization.assertOrganization(context, value.organizationId);
    }

    let listings = await this.store.listListings(
      value.status ? { status: value.status } : undefined,
    );
    if (!value.status) {
      listings = listings.filter((listing) => this.canView(context, listing));
    } else {
      listings = listings.filter((listing) => this.canView(context, listing));
    }

    if (value.organizationId) {
      listings = listings.filter((listing) => listing.organization_id === value.organizationId);
    }
    if (value.sellerUserId) {
      listings = listings.filter((listing) => listing.seller_user_id === value.sellerUserId);
    }

    const [products, categories, locationRows] = await Promise.all([
      this.catalog.listProducts(),
      this.catalog.listCategories(),
      this.store.listLocations(),
    ]);
    const productById = new Map(products.map((item) => [item.id, item]));
    const categoryById = new Map(categories.map((item) => [item.id, item]));

    if (value.productId) {
      listings = listings.filter((listing) => listing.product_id === value.productId);
    }
    if (value.categoryId) {
      listings = listings.filter(
        (listing) => productById.get(listing.product_id)?.category_id === value.categoryId,
      );
    }
    if (value.categoryCode) {
      const categoryIds = new Set(
        categories
          .filter((category) => category.code === value.categoryCode)
          .map((category) => category.id),
      );
      listings = listings.filter((listing) => {
        const product = productById.get(listing.product_id);
        return product && categoryIds.has(product.category_id);
      });
    }
    if (value.minPrice !== undefined) {
      listings = listings.filter((listing) => listing.unit_price >= value.minPrice);
    }
    if (value.maxPrice !== undefined) {
      listings = listings.filter((listing) => listing.unit_price <= value.maxPrice);
    }

    if (value.search || value.location) {
      const labelsByListing = new Map();
      for (const location of locationRows) {
        if (!labelsByListing.has(location.listing_id)) labelsByListing.set(location.listing_id, []);
        labelsByListing.get(location.listing_id).push(location.location_label);
      }
      listings = listings.filter((listing) => {
        const product = productById.get(listing.product_id);
        const category = product ? categoryById.get(product.category_id) : null;
        if (
          value.search &&
          ![
            listing.title,
            listing.description,
            product?.name,
            product?.name_bn,
            product?.sku,
            category?.name,
            category?.name_bn,
          ]
            .filter(Boolean)
            .some((item) => matchesSearch(item, value.search))
        ) {
          return false;
        }
        if (
          value.location &&
          ![listing.available_location, ...(labelsByListing.get(listing.id) || [])]
            .filter(Boolean)
            .some((item) => matchesSearch(item, value.location))
        ) {
          return false;
        }
        return true;
      });
    }

    const distanceById = new Map();
    if (value.latitude !== undefined) {
      const nearby = await this.store.searchNearby({
        latitude: value.latitude,
        longitude: value.longitude,
        radiusMeters: value.radiusMeters,
        listingIds: listings.map((listing) => listing.id),
        statuses: value.status ? [value.status] : ['ACTIVE'],
      });
      for (const row of nearby) {
        if (!distanceById.has(row.listing_id)) {
          distanceById.set(row.listing_id, row.distance_meters);
        }
      }
      listings = listings.filter((listing) => distanceById.has(listing.id));
    }

    listings.sort((left, right) => {
      if (value.sort === 'price_asc') return left.unit_price - right.unit_price;
      if (value.sort === 'price_desc') return right.unit_price - left.unit_price;
      if (value.sort === 'distance') {
        const leftDistance = distanceById.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightDistance = distanceById.get(right.id) ?? Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
      }
      return right.created_at.getTime() - left.created_at.getTime();
    });

    const page = listings.slice(value.offset, value.offset + value.limit);
    return this.relatedForMany(page, distanceById, {
      products,
      categories,
      locations: locationRows,
    });
  }

  async getListing({ context, listingId }) {
    const listing = this.assertCanView(
      context,
      requireRecord(await this.store.findListing(listingId), 'Listing'),
    );
    return this.relatedFor(listing);
  }

  async createListing({ context, input, request }) {
    const value = validate(dto.listingCreateSchema, input, 'listing input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const product = await this.requireProduct(context, value.productId, organizationId);
    const grade = await this.requireGrade(value.qualityGradeId, organizationId);
    const listingId = randomUUID();

    const record = await this.store.createListing({
      id: listingId,
      organization_id: organizationId,
      product_id: product.id,
      seller_user_id: context.user.id,
      inventory_id: null,
      quality_grade_id: grade?.id || null,
      status: value.status,
      title: value.title,
      description: value.description ?? null,
      unit_price: value.unitPrice,
      currency: value.currency,
      quantity_available: value.quantityAvailable,
      min_order_quantity: value.minOrderQuantity,
      harvest_date: parseDate(value.harvestDate),
      available_location: value.availableLocation || null,
      starts_at: parseTimestamp(value.startsAt),
      ends_at: parseTimestamp(value.endsAt),
    });

    for (const location of this.prepareLocations(value.locations, listingId, organizationId)) {
      await this.store.createLocation(location);
    }
    for (const image of this.prepareImages(value.images, listingId)) {
      await this.store.createImage(image);
    }

    await this.audit(
      {
        action: EVENTS.LISTING_CREATED,
        entityType: 'ProductListing',
        entityId: record.id,
        organizationId,
        after: record,
      },
      request,
    );
    if (record.status === 'ACTIVE') {
      this.publish(EVENTS.LISTING_PUBLISHED, { listingId: record.id }, record.id);
    }
    return this.getListing({ context, listingId: record.id });
  }

  async updateListing({ context, listingId, input, request }) {
    const value = validate(dto.listingUpdateSchema, input, 'listing update');
    const listing = await this.assertCanWrite(context, await this.store.findListing(listingId));

    const nextAvailableLocation =
      value.availableLocation !== undefined ? value.availableLocation : listing.available_location;
    const nextHarvestDate =
      value.harvestDate !== undefined ? value.harvestDate : listing.harvest_date;
    if (!nextAvailableLocation && !nextHarvestDate) {
      throw new ValidationError({
        message: 'Either availableLocation or harvestDate is required.',
        details: { field: 'availableLocation' },
      });
    }

    const grade =
      value.qualityGradeId !== undefined
        ? await this.requireGrade(value.qualityGradeId, listing.organization_id)
        : null;
    const startsAt =
      value.startsAt !== undefined ? parseTimestamp(value.startsAt) : listing.starts_at;
    const endsAt = value.endsAt !== undefined ? parseTimestamp(value.endsAt) : listing.ends_at;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new ValidationError({ message: 'endsAt must be later than startsAt.' });
    }

    const updated = await this.store.updateListing(listingId, {
      ...(value.status !== undefined ? { status: value.status } : {}),
      ...(value.title !== undefined ? { title: value.title } : {}),
      ...(value.description !== undefined ? { description: value.description } : {}),
      ...(value.unitPrice !== undefined ? { unit_price: value.unitPrice } : {}),
      ...(value.currency !== undefined ? { currency: value.currency } : {}),
      ...(value.quantityAvailable !== undefined
        ? { quantity_available: value.quantityAvailable }
        : {}),
      ...(value.minOrderQuantity !== undefined
        ? { min_order_quantity: value.minOrderQuantity }
        : {}),
      ...(value.qualityGradeId !== undefined ? { quality_grade_id: grade?.id || null } : {}),
      ...(value.harvestDate !== undefined ? { harvest_date: parseDate(value.harvestDate) } : {}),
      ...(value.availableLocation !== undefined
        ? { available_location: value.availableLocation || null }
        : {}),
      ...(value.startsAt !== undefined ? { starts_at: startsAt } : {}),
      ...(value.endsAt !== undefined ? { ends_at: endsAt } : {}),
    });

    await this.audit(
      {
        action: EVENTS.LISTING_UPDATED,
        entityType: 'ProductListing',
        entityId: updated.id,
        organizationId: updated.organization_id,
        before: listing,
        after: updated,
      },
      request,
    );
    if (updated.status === 'ACTIVE' && listing.status !== 'ACTIVE') {
      this.publish(EVENTS.LISTING_PUBLISHED, { listingId: updated.id }, updated.id);
    }
    if (updated.status === 'INACTIVE' && listing.status !== 'INACTIVE') {
      this.publish(EVENTS.LISTING_DEACTIVATED, { listingId: updated.id }, updated.id);
    }
    return this.getListing({ context, listingId: updated.id });
  }

  async deactivateListing({ context, listingId, request }) {
    return this.updateListing({
      context,
      listingId,
      input: { status: 'INACTIVE' },
      request,
    });
  }

  async addLocation({ context, listingId, input, request }) {
    const value = validate(dto.locationCreateSchema, input, 'listing location input');
    const listing = await this.assertCanWrite(context, await this.store.findListing(listingId));
    const location = await this.store.createLocation(
      this.prepareLocations([value], listingId, listing.organization_id)[0],
    );
    await this.audit(
      {
        action: EVENTS.LOCATION_ADDED,
        entityType: 'ListingLocation',
        entityId: location.id,
        organizationId: listing.organization_id,
        after: { listingId, locationId: location.id },
      },
      request,
    );
    return dto.toLocationDto(location);
  }

  async deleteLocation({ context, listingId, locationId, request }) {
    const listing = await this.assertCanWrite(context, await this.store.findListing(listingId));
    const location = requireRecord(await this.store.findLocation(locationId), 'Listing location');
    if (location.listing_id !== listingId) {
      throw new NotFoundError({ message: 'Listing location was not found.' });
    }
    await this.store.deleteLocation(locationId);
    await this.audit(
      {
        action: EVENTS.LOCATION_REMOVED,
        entityType: 'ListingLocation',
        entityId: locationId,
        organizationId: listing.organization_id,
        before: { listingId, locationId },
      },
      request,
    );
    return { id: locationId, deleted: true };
  }

  async addImage({ context, listingId, input, request }) {
    const value = validate(dto.listingImageCreateSchema, input, 'listing image input');
    const listing = await this.assertCanWrite(context, await this.store.findListing(listingId));
    const images = await this.store.listImages({ listing_id: listingId });
    if (images.some((image) => image.sort_order === value.sortOrder)) {
      throw new ConflictError({ message: 'Image sort order is already in use.' });
    }
    const image = await this.store.createImage(this.prepareImages([value], listingId)[0]);
    await this.audit(
      {
        action: EVENTS.IMAGE_ADDED,
        entityType: 'ListingImage',
        entityId: image.id,
        organizationId: listing.organization_id,
        after: image,
      },
      request,
    );
    return dto.toImageDto(image);
  }

  async deleteImage({ context, listingId, imageId, request }) {
    const listing = await this.assertCanWrite(context, await this.store.findListing(listingId));
    const image = requireRecord(await this.store.findImage(imageId), 'Listing image');
    if (image.listing_id !== listingId) {
      throw new NotFoundError({ message: 'Listing image was not found.' });
    }
    await this.store.deleteImage(imageId);
    await this.audit(
      {
        action: EVENTS.IMAGE_REMOVED,
        entityType: 'ListingImage',
        entityId: imageId,
        organizationId: listing.organization_id,
        before: image,
      },
      request,
    );
    return { id: imageId, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Favorites, reports, messages, and public seller profiles
  // ---------------------------------------------------------------------------

  async listFavorites({ context }) {
    const favorites = await this.store.listFavorites({ user_id: context.user.id });
    const listings = [];
    for (const favorite of favorites) {
      const listing = await this.store.findListing(favorite.listing_id);
      if (listing && this.canView(context, listing)) listings.push(listing);
    }
    return this.relatedForMany(listings);
  }

  async addFavorite({ context, listingId, request }) {
    const listing = this.assertCanView(
      context,
      requireRecord(await this.store.findListing(listingId), 'Listing'),
    );
    const existing = await this.store.findFavorite(context.user.id, listingId);
    if (existing) return this.relatedFor(listing);
    await this.store.createFavorite({
      id: randomUUID(),
      user_id: context.user.id,
      listing_id: listingId,
    });
    await this.audit(
      {
        action: EVENTS.FAVORITE_ADDED,
        entityType: 'FavoriteListing',
        entityId: listingId,
        organizationId: listing.organization_id,
        after: { listingId },
      },
      request,
    );
    return this.relatedFor(listing);
  }

  async removeFavorite({ context, listingId, request }) {
    const listing = requireRecord(await this.store.findListing(listingId), 'Listing');
    await this.store.deleteFavorite(context.user.id, listingId);
    await this.audit(
      {
        action: EVENTS.FAVORITE_REMOVED,
        entityType: 'FavoriteListing',
        entityId: listingId,
        organizationId: listing.organization_id,
        after: { listingId },
      },
      request,
    );
    return { listingId, favorited: false };
  }

  async createReport({ context, listingId, input, request }) {
    const value = validate(dto.reportCreateSchema, input, 'listing report input');
    const listing = this.assertCanView(
      context,
      requireRecord(await this.store.findListing(listingId), 'Listing'),
    );
    if (listing.seller_user_id === context.user.id) {
      throw new ValidationError({ message: 'A seller cannot report their own listing.' });
    }
    const existing = await this.store.listReports({
      listing_id: listingId,
      reporter_user_id: context.user.id,
    });
    if (existing.length > 0) {
      throw new ConflictError({ message: 'You have already reported this listing.' });
    }
    const report = await this.store.createReport({
      id: randomUUID(),
      listing_id: listingId,
      reporter_user_id: context.user.id,
      reason: value.reason,
      details: value.details ?? null,
      status: 'PENDING',
      reviewed_by_user_id: null,
      reviewed_at: null,
    });
    await this.audit(
      {
        action: EVENTS.REPORT_CREATED,
        entityType: 'ListingReport',
        entityId: report.id,
        organizationId: listing.organization_id,
        after: { listingId, reason: report.reason, status: report.status },
      },
      request,
    );
    return dto.toReportDto(report);
  }

  async listReports({ context, query = {} }) {
    const value = validate(dto.reportQuerySchema, query, 'report query');
    let reports = await this.store.listReports();
    if (!context.isSuperAdmin) {
      reports = reports.filter((report) => report.reporter_user_id === context.user.id);
    }
    if (value.listingId)
      reports = reports.filter((report) => report.listing_id === value.listingId);
    if (value.status) reports = reports.filter((report) => report.status === value.status);
    return reports.slice(0, value.limit).map(dto.toReportDto);
  }

  async reviewReport({ context, reportId, input, request }) {
    const value = validate(dto.reportReviewSchema, input, 'report review input');
    const report = requireRecord(await this.store.findReport(reportId), 'Listing report');
    const listing = await this.store.findListing(report.listing_id);
    const updated = await this.store.updateReport(reportId, {
      status: value.status,
      reviewed_by_user_id: context.user.id,
      reviewed_at: new Date(),
    });
    await this.audit(
      {
        action: EVENTS.REPORT_REVIEWED,
        entityType: 'ListingReport',
        entityId: reportId,
        organizationId: listing?.organization_id || null,
        before: report,
        after: updated,
      },
      request,
    );
    return dto.toReportDto(updated);
  }

  async createMessage({ context, listingId, input, request }) {
    const value = validate(dto.messageCreateSchema, input, 'message input');
    const listing = this.assertCanView(
      context,
      requireRecord(await this.store.findListing(listingId), 'Listing'),
    );
    if (listing.seller_user_id === context.user.id) {
      throw new ValidationError({ message: 'A seller cannot message their own listing.' });
    }
    const message = await this.store.createMessage({
      id: randomUUID(),
      listing_id: listingId,
      sender_user_id: context.user.id,
      recipient_user_id: listing.seller_user_id,
      body: value.body,
      read_at: null,
    });
    await this.audit(
      {
        action: EVENTS.MESSAGE_SENT,
        entityType: 'ListingMessage',
        entityId: message.id,
        organizationId: listing.organization_id,
        after: { listingId, messageId: message.id },
      },
      request,
    );
    return dto.toMessageDto(message);
  }

  async listMessages({ context, query = {} }) {
    const value = validate(dto.messageQuerySchema, query, 'message query');
    const messages = await this.store.listMessages();
    return messages
      .filter(
        (message) =>
          (message.sender_user_id === context.user.id ||
            message.recipient_user_id === context.user.id) &&
          (!value.listingId || message.listing_id === value.listingId),
      )
      .slice(0, value.limit)
      .map(dto.toMessageDto);
  }

  async markMessageRead({ context, messageId, request }) {
    const message = requireRecord(await this.store.findMessage(messageId), 'Message');
    if (!context.isSuperAdmin && message.recipient_user_id !== context.user.id) {
      throw new ForbiddenError({
        message: 'Only the recipient may mark a message as read.',
        details: { code: 'resource_ownership_denied' },
      });
    }
    const updated = await this.store.updateMessage(messageId, {
      read_at: message.read_at || new Date(),
    });
    await this.audit(
      {
        action: EVENTS.MESSAGE_READ,
        entityType: 'ListingMessage',
        entityId: messageId,
        after: { messageId },
      },
      request,
    );
    return dto.toMessageDto(updated);
  }

  async getSeller({ sellerId }) {
    const seller = await this.publicSeller(sellerId);
    if (!seller || !seller.id) throw new NotFoundError({ message: 'Seller was not found.' });
    return seller;
  }
}

module.exports = { MarketplaceService, MarketplaceServiceToken, EVENTS };
