const { MODULE_ID, MODULE_NAME, FarmersEntity } = require('./farmers.entity');
const { FarmersRepositoryToken } = require('./farmers.repository');
const { FarmStoreToken } = require('./farm.repository');
const farmDomain = require('./farm.entity');

module.exports = {
  MODULE_ID,
  MODULE_NAME,
  FarmersEntity,
  FarmersRepositoryToken,
  FarmStoreToken,
  ...farmDomain,
};
