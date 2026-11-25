const authRoutes = require('./auth.routes');
const { registerHttpAuthorization } = require('./http-authorization');
const iamRoutes = require('./iam.routes');

module.exports = { authRoutes, iamRoutes, registerHttpAuthorization };
