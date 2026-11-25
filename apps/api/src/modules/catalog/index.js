const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/catalog.entity');
const { CatalogRepositoryToken } = require('./domain/catalog.repository');
const { CatalogInMemoryRepository } = require('./infrastructure/catalog.repository');
const { CatalogService, CatalogServiceToken } = require('./application/catalog.service');
const catalogRoutes = require('./presentation/catalog.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'catalog',
  description: 'Product definitions, categories, variants, and publication state.',
  dependsOn: ['organizations', 'farmers', 'agriculture'],
  publishes: ['catalog.initialized', 'catalog.product.published'],
  subscribes: [],
  repositoryToken: CatalogRepositoryToken,
  repository: CatalogInMemoryRepository,
  serviceToken: CatalogServiceToken,
  service: CatalogService,
  routes: catalogRoutes,
});

module.exports = { definition, routes: catalogRoutes };
