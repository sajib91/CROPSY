const entity = require('./agriculture.entity');
const repository = require('./agriculture.repository');

module.exports = {
  ...entity,
  ...repository,
};
