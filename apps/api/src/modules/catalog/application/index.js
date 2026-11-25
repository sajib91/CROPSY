const { CatalogService, CatalogServiceToken } = require('./catalog.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./catalog.dto');

module.exports = {
  CatalogService,
  CatalogServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
