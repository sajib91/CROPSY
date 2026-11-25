const { defineModule } = require('../../shared/module/define-module');
const { MODULE_ID, MODULE_NAME } = require('./domain/iam.entity');
const { IamRepositoryToken } = require('./domain/iam.repository');
const { IamInMemoryRepository } = require('./infrastructure/iam.repository');
const { IamService, IamServiceToken } = require('./application/iam.service');
const iamRoutes = require('./presentation/iam.routes');

const definition = defineModule({
  id: MODULE_ID,
  name: MODULE_NAME,
  path: 'iam',
  description: 'Authentication, roles, permissions, and access policy ownership.',
  dependsOn: [],
  publishes: ['iam.initialized', 'iam.role.assigned', 'iam.permission.granted'],
  subscribes: [],
  repositoryToken: IamRepositoryToken,
  repository: IamInMemoryRepository,
  serviceToken: IamServiceToken,
  service: IamService,
  routes: iamRoutes,
});

module.exports = { definition, routes: iamRoutes };
