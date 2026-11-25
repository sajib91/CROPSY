const { FarmersService, FarmersServiceToken, EVENTS } = require('./farmers.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./farmers.dto');
const farmDto = require('./farm.dto');

module.exports = {
  EVENTS,
  FarmersService,
  FarmersServiceToken,
  farmDto,
  moduleInfoSchema,
  toModuleInfoDto,
};
