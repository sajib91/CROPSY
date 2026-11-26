const dto = require('./quality.dto');
const { EVENTS, QualityService, QualityServiceToken } = require('./quality.service');

module.exports = {
  QualityService,
  QualityServiceToken,
  EVENTS,
  ...dto,
};
