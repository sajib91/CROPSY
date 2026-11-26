const { EVENTS, PaymentsService, PaymentsServiceToken } = require('./payments.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./payments.dto');

module.exports = {
  EVENTS,
  PaymentsService,
  PaymentsServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
