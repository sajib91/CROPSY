const dto = require('./orders.dto');
const { EVENTS, OrdersService, OrdersServiceToken } = require('./orders.service');

module.exports = {
  EVENTS,
  OrdersService,
  OrdersServiceToken,
  ...dto,
};
