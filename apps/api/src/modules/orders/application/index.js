const { OrdersService, OrdersServiceToken } = require('./orders.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./orders.dto');

module.exports = {
  OrdersService,
  OrdersServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
