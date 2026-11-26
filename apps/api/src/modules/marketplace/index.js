const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
  MarketplaceAccessPortToken,
  MarketplaceListingStockToken,
  PlatformAuthorizationToken,
} = require('../../shared/di/tokens');
const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/marketplace.entity');
const {
  MarketplaceRepositoryToken,
  MarketplaceStoreToken,
} = require('./domain/marketplace.repository');
const {
  MarketplaceInMemoryRepository,
  MarketplaceInMemoryStore,
  MarketplacePrismaStore,
} = require('./infrastructure');
const {
  MarketplaceService,
  MarketplaceServiceToken,
  EVENTS,
} = require('./application/marketplace.service');
const marketplaceRoutes = require('./presentation/marketplace.routes');

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function registerMarketplaceStore({ container }) {
  if (!container.has(MarketplaceStoreToken)) {
    container.register(MarketplaceStoreToken, (resolver) => {
      const env = resolver.resolve(ConfigToken);
      if (env.MARKETPLACE_STORE === 'prisma') {
        const { PrismaClient } = require('@prisma/client');
        return new MarketplacePrismaStore({ prisma: new PrismaClient() });
      }
      return new MarketplaceInMemoryStore();
    });
  }

  // Read-only listing lookup for checkout. Orders receives persistence copies
  // and has no access to marketplace mutations or private seller profile data.
  if (!container.has(MarketplaceAccessPortToken)) {
    container.register(MarketplaceAccessPortToken, (resolver) => {
      const store = resolver.resolve(MarketplaceStoreToken);
      return Object.freeze({
        findListing: async (id) => copy(await store.findListing(id)),
        listListings: async (filters) => (await store.listListings(filters)).map(copy),
      });
    });
  }

  // Narrow mutation capability for checkout fulfillment. It exposes only
  // availability decrement/restore, never listing creation or price changes.
  if (!container.has(MarketplaceListingStockToken)) {
    container.register(MarketplaceListingStockToken, (resolver) => {
      const store = resolver.resolve(MarketplaceStoreToken);
      return Object.freeze({
        decrementAvailability: (id, quantity) => store.decrementAvailability(id, quantity),
        restoreAvailability: (id, quantity) => store.restoreAvailability(id, quantity),
      });
    });
  }
}

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'marketplace',
  description: 'Seller listings, buyer discovery, favorites, reports, and platform messaging.',
  dependsOn: ['catalog', 'organizations', 'buyers'],
  publishes: [...new Set(Object.values(EVENTS))],
  subscribes: [],
  repositoryToken: MarketplaceRepositoryToken,
  repository: MarketplaceInMemoryRepository,
  serviceToken: MarketplaceServiceToken,
  service: MarketplaceService,
  serviceDependencies: {
    store: MarketplaceStoreToken,
    catalog: CatalogAccessPortToken,
    identityStore: IdentityStoreToken,
    authorization: PlatformAuthorizationToken,
    config: ConfigToken,
  },
  routes: marketplaceRoutes,
  subscriptions: registerMarketplaceStore,
});

module.exports = { definition, routes: marketplaceRoutes, registerMarketplaceStore };
