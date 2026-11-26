const { defineRepositoryToken } = require('../../../shared/domain/repository');

const MarketplaceRepositoryToken = defineRepositoryToken('marketplace');
const MarketplaceStoreToken = defineRepositoryToken('marketplace.store');

/**
 * Repository port for the module info entity.
 * @typedef {object} MarketplaceRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for marketplace records. Implementations return plain
 * snake_case records with Date values. Location coordinates are represented as
 * `{ latitude, longitude }` internally and are never included in public DTOs.
 *
 * @typedef {object} MarketplaceStoreContract
 * @property {(filters?: object) => Promise<object[]>} listListings
 * @property {(id: string) => Promise<object|null>} findListing
 * @property {(filters?: object) => Promise<object[]>} listPriceObservations
 * @property {(input: object) => Promise<object>} createListing
 * @property {(id: string, patch: object) => Promise<object>} updateListing
 * @property {(id: string, quantity: number) => Promise<object>} decrementAvailability
 * @property {(id: string, quantity: number) => Promise<object>} restoreAvailability
 * @property {(filters?: object) => Promise<object[]>} listLocations
 * @property {(id: string) => Promise<object|null>} findLocation
 * @property {(input: object) => Promise<object>} createLocation
 * @property {(id: string) => Promise<boolean>} deleteLocation
 * @property {(filters?: object) => Promise<object[]>} listImages
 * @property {(id: string) => Promise<object|null>} findImage
 * @property {(input: object) => Promise<object>} createImage
 * @property {(id: string) => Promise<boolean>} deleteImage
 * @property {(filters?: object) => Promise<object[]>} listFavorites
 * @property {(userId: string, listingId: string) => Promise<object|null>} findFavorite
 * @property {(input: object) => Promise<object>} createFavorite
 * @property {(userId: string, listingId: string) => Promise<boolean>} deleteFavorite
 * @property {(filters?: object) => Promise<object[]>} listReports
 * @property {(id: string) => Promise<object|null>} findReport
 * @property {(input: object) => Promise<object>} createReport
 * @property {(id: string, patch: object) => Promise<object>} updateReport
 * @property {(filters?: object) => Promise<object[]>} listMessages
 * @property {(id: string) => Promise<object|null>} findMessage
 * @property {(input: object) => Promise<object>} createMessage
 * @property {(id: string, patch: object) => Promise<object>} updateMessage
 * @property {(input: object) => Promise<object[]>} searchNearby
 */

const MARKETPLACE_STORE_METHODS = Object.freeze([
  'listListings',
  'findListing',
  'listPriceObservations',
  'createListing',
  'updateListing',
  'decrementAvailability',
  'restoreAvailability',
  'listLocations',
  'findLocation',
  'createLocation',
  'deleteLocation',
  'listImages',
  'findImage',
  'createImage',
  'deleteImage',
  'listFavorites',
  'findFavorite',
  'createFavorite',
  'deleteFavorite',
  'listReports',
  'findReport',
  'createReport',
  'updateReport',
  'listMessages',
  'findMessage',
  'createMessage',
  'updateMessage',
  'searchNearby',
]);

module.exports = {
  MARKETPLACE_STORE_METHODS,
  MarketplaceRepositoryToken,
  MarketplaceStoreToken,
};
