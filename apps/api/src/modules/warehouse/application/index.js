const { WarehouseService, WarehouseServiceToken, EVENTS } = require('./warehouse.service');
const warehouseDto = require('./warehouse.dto');

module.exports = { WarehouseService, WarehouseServiceToken, EVENTS, ...warehouseDto };
