const { EVENTS, TraceabilityService, TraceabilityServiceToken } = require('./traceability.service');
const dto = require('./traceability.dto');

module.exports = {
  TraceabilityService,
  TraceabilityServiceToken,
  EVENTS,
  ...dto,
};
