const { QualityService, QualityServiceToken } = require('./quality.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./quality.dto');

module.exports = {
  QualityService,
  QualityServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
