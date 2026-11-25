const { LogisticsService, LogisticsServiceToken } = require('./logistics.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./logistics.dto');

module.exports = {
  LogisticsService,
  LogisticsServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
