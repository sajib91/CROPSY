const { FarmersService, FarmersServiceToken } = require('./farmers.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./farmers.dto');

module.exports = {
  FarmersService,
  FarmersServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
