const { IamAuthInMemoryRepository } = require('./auth-in-memory.repository');
const { IamAuthPrismaRepository } = require('./auth-prisma.repository');
const { IamInMemoryRepository } = require('./iam.repository');

module.exports = {
  IamAuthInMemoryRepository,
  IamAuthPrismaRepository,
  IamInMemoryRepository,
};
