const { UsersService, UsersServiceToken } = require('./users.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./users.dto');

module.exports = {
  UsersService,
  UsersServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
