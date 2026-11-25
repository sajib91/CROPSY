const { BuyersService, BuyersServiceToken } = require('./buyers.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./buyers.dto');

module.exports = {
  BuyersService,
  BuyersServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
