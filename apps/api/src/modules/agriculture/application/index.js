const dto = require('./agriculture.dto');
const { EVENTS, AgricultureService, AgricultureServiceToken } = require('./agriculture.service');

module.exports = {
  EVENTS,
  AgricultureService,
  AgricultureServiceToken,
  ...dto,
};
