const {
  CatalogAccessPortToken,
  ConfigToken,
  IdentityStoreToken,
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

function registerMarketplaceStore({ container }) {
  if (container.has(MarketplaceStoreToken)) return;

  container.register(MarketplaceStoreToken, (resolver) => {
    const env = resolver.resolve(ConfigToken);
    if (env.MARKETPLACE_STORE === 'prisma') {
      const { PrismaClient } = require('@prisma/client');
      return new MarketplacePrismaStore({ prisma: new PrismaClient() });
    }
    return new MarketplaceInMemoryStore();
  });
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
