const { WarehouseService, WarehouseServiceToken } = require('./warehouse.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./warehouse.dto');

module.exports = {
  WarehouseService,
  WarehouseServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
