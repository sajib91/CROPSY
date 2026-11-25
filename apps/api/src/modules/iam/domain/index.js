const authPolicy = require('./auth-policy');
const { AuthStoreToken } = require('./auth.repository');
const { MODULE_ID, MODULE_NAME, IamEntity } = require('./iam.entity');
const { IamRepositoryToken } = require('./iam.repository');

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  IamEntity,
  IamRepositoryToken,
  AuthStoreToken,
  ...authPolicy,
};
