const { OrganizationsService, OrganizationsServiceToken } = require('./organizations.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./organizations.dto');

module.exports = {
  OrganizationsService,
  OrganizationsServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
