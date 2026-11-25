const { IamService, IamServiceToken } = require('./iam.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./iam.dto');

module.exports = {
  IamService,
  IamServiceToken,
  moduleInfoSchema,
  toModuleInfoDto,
};
