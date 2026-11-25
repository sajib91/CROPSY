const authDto = require('./auth.dto');
const { AuthService } = require('./auth.service');
const { AuthorizationService } = require('./authorization.service');
const { IamService, IamServiceToken } = require('./iam.service');
const { moduleInfoSchema, toModuleInfoDto } = require('./iam.dto');
const serviceTokens = require('./tokens');
const { TokenManager } = require('./token-manager.service');

module.exports = {
  AuthService,
  AuthorizationService,
  IamService,
  IamServiceToken,
  TokenManager,
  moduleInfoSchema,
  toModuleInfoDto,
  ...authDto,
  ...serviceTokens,
};
