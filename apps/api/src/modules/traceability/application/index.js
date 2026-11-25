const { TraceabilityService, TraceabilityServiceToken } = require('./traceability.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./traceability.dto');

module.exports = {
  TraceabilityService,
  TraceabilityServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
