const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AuthStoreToken = defineRepositoryToken('iam.auth-store');

/**
 * Persistence port for authentication, sessions, OTPs, RBAC grants, and audit.
 * Implementations must never store raw passwords, raw refresh tokens, or raw
 * OTP codes. All verification is performed against salted hashes or HMACs.
 *
 * @typedef {object} AuthStoreContract
 * @property {(code: string) => Promise<object|null>} findRoleByCode
 * @property {() => Promise<object[]>} listRoles
 * @property {() => Promise<object[]>} listPermissions
 * @property {(code: string, permissionCodes: string[]) => Promise<object>} replaceRolePermissions
 * @property {(id: string) => Promise<object|null>} findUserById
 * @property {(identifier: string) => Promise<object|null>} findUserByIdentifier
 * @property {(input: object) => Promise<object>} createUser
 * @property {(id: string, patch: object) => Promise<object>} updateUser
 * @property {(userId: string) => Promise<object[]>} listUserRoles
 * @property {(input: object) => Promise<object>} addUserRole
 * @property {(userId: string) => Promise<object[]>} listOrganizationMemberships
 * @property {(input: object) => Promise<object>} addOrganizationMember
 * @property {(input: object) => Promise<object>} createOtp
 * @property {(input: object) => Promise<object|null>} findLatestOtp
 * @property {(id: string) => Promise<object|null>} findOtpById
 * @property {(id: string, patch: object) => Promise<object>} updateOtp
 * @property {(input: object) => Promise<object>} createSession
 * @property {(id: string) => Promise<object|null>} findSession
 * @property {(id: string, patch: object) => Promise<object>} updateSession
 * @property {(userId: string) => Promise<object[]>} listSessions
 * @property {(input: object) => Promise<object>} createRefreshToken
 * @property {(hash: string) => Promise<object|null>} findRefreshTokenByHash
 * @property {(id: string, patch: object) => Promise<object>} updateRefreshToken
 * @property {(sessionId: string) => Promise<number>} revokeRefreshTokensForSession
 * @property {(entry: object) => Promise<object>} appendAudit
 * @property {(filter?: object) => Promise<object[]>} listAudit
 */

module.exports = { AuthStoreToken };
