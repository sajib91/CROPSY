const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/marketplace.entity');
const { MarketplaceRepositoryToken } = require('./domain/marketplace.repository');
const { MarketplaceInMemoryRepository } = require('./infrastructure/marketplace.repository');
const {
  MarketplaceService,
  MarketplaceServiceToken,
} = require('./application/marketplace.service');
const marketplaceRoutes = require('./presentation/marketplace.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'marketplace',
  description: 'Listings, offers, discovery, and buyer-facing market rules.',
  dependsOn: ['catalog', 'organizations', 'buyers'],
  publishes: ['marketplace.initialized', 'marketplace.listing.created'],
  subscribes: [],
  repositoryToken: MarketplaceRepositoryToken,
  repository: MarketplaceInMemoryRepository,
  serviceToken: MarketplaceServiceToken,
  service: MarketplaceService,
  routes: marketplaceRoutes,
});

module.exports = { definition, routes: marketplaceRoutes };
