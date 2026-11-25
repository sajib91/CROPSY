const { AdministrationService, AdministrationServiceToken } = require('./administration.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./administration.dto');

module.exports = {
  AdministrationService,
  AdministrationServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
