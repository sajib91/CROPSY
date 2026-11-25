const { CatalogService, CatalogServiceToken, EVENTS } = require('./catalog.service');
const dto = require('./catalog.dto');

module.exports = {
  CatalogService,
  CatalogServiceToken,
  EVENTS,
  ...dto,
};
