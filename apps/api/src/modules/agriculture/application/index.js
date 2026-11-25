const { AgricultureService, AgricultureServiceToken } = require('./agriculture.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./agriculture.dto');

module.exports = {
  AgricultureService,
  AgricultureServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
