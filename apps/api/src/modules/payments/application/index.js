const { PaymentsService, PaymentsServiceToken } = require('./payments.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./payments.dto');

module.exports = {
  PaymentsService,
  PaymentsServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
