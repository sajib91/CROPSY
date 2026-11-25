const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AuthStoreToken = defineRepositoryToken('iam.auth-store');

/**
 * Shared identity-store persistence port.
 *
 * IAM owns this port, but the organization and user modules consume it through
 * a composition-root alias. Implementations must never store raw passwords,
 * raw refresh/session tokens, raw invitation tokens, or raw OTP codes. All
 * verification is performed against salted hashes or HMACs.
 *
 * @typedef {object} AuthStoreContract
 * @property {(code: string) => Promise<object|null>} findRoleByCode
 * @property {(id: string) => Promise<object|null>} findRoleById
 * @property {() => Promise<object[]>} listRoles
 * @property {() => Promise<object[]>} listPermissions
 * @property {(code: string, permissionCodes: string[]) => Promise<object>} replaceRolePermissions
 * @property {(id: string) => Promise<object|null>} findUserById
 * @property {(identifier: string) => Promise<object|null>} findUserByIdentifier
 * @property {() => Promise<object[]>} listUsers
 * @property {(input: object) => Promise<object>} createUser
 * @property {(id: string, patch: object) => Promise<object>} updateUser
 * @property {(userId: string) => Promise<object[]>} listUserRoles
 * @property {(input: object) => Promise<object>} addUserRole
 * @property {(input: object) => Promise<number>} removeUserRole
 * @property {(userId: string, organizationId: string) => Promise<number>} removeUserRolesForOrganization
 * @property {(input: object) => Promise<object>} createOrganization
 * @property {(id: string) => Promise<object|null>} findOrganization
 * @property {(slug: string) => Promise<object|null>} findOrganizationBySlug
 * @property {(filter?: object) => Promise<object[]>} listOrganizations
 * @property {(id: string, patch: object) => Promise<object>} updateOrganization
 * @property {(input: object) => Promise<object>} addOrganizationMember
 * @property {(organizationId: string, userId: string, patch: object) => Promise<object>} updateOrganizationMember
 * @property {(userId: string) => Promise<object[]>} listOrganizationMemberships
 * @property {(organizationId: string) => Promise<object[]>} listOrganizationMembers
 * @property {(input: object) => Promise<object>} createOrganizationInvitation
 * @property {(tokenHash: string) => Promise<object|null>} findOrganizationInvitationByTokenHash
 * @property {(organizationId: string, filter?: object) => Promise<object[]>} listOrganizationInvitations
 * @property {(id: string, patch: object) => Promise<object>} updateOrganizationInvitation
 * @property {(input: object) => Promise<object>} createOrganizationAddress
 * @property {(organizationId: string) => Promise<object[]>} listOrganizationAddresses
 * @property {(id: string, patch: object) => Promise<object>} updateOrganizationAddress
 * @property {(input: object) => Promise<object>} createOrganizationDocument
 * @property {(organizationId: string) => Promise<object[]>} listOrganizationDocuments
 * @property {(id: string, patch: object) => Promise<object>} updateOrganizationDocument
 * @property {(userId: string) => Promise<object|null>} findUserProfile
 * @property {(userId: string, patch: object) => Promise<object>} upsertUserProfile
 * @property {(input: object) => Promise<object>} createUserAddress
 * @property {(userId: string) => Promise<object[]>} listUserAddresses
 * @property {(id: string, patch: object) => Promise<object>} updateUserAddress
 * @property {(userId: string) => Promise<object[]>} listNotificationPreferences
 * @property {(userId: string, preferences: object[]) => Promise<object[]>} replaceNotificationPreferences
 * @property {(input: object) => Promise<object|null>} findRoleProfileExtension
 * @property {(input: object) => Promise<object>} upsertRoleProfileExtension
 * @property {(userId: string) => Promise<object[]>} listRoleProfileExtensions
 * @property {(userId: string) => Promise<object|null>} findFarmerProfile
 * @property {(input: object) => Promise<object>} upsertFarmerProfile
 * @property {(input: object) => Promise<object>} createOtp
 * @property {(input: object) => Promise<object|null>} findLatestOtp
 * @property {(id: string) => Promise<object|null>} findOtpById
 * @property {(id: string, patch: object) => Promise<object>} updateOtp
 * @property {(input: object) => Promise<object>} createSession
 * @property {(id: string) => Promise<object|null>} findSession
 * @property {(hash: string) => Promise<object|null>} findSessionByTokenHash
 * @property {(id: string, patch: object) => Promise<object>} updateSession
 * @property {(userId: string) => Promise<object[]>} listSessions
 * @property {(input: object) => Promise<object>} createRefreshToken
 * @property {(hash: string) => Promise<object|null>} findRefreshTokenByHash
 * @property {(id: string) => Promise<object|null>} findRefreshTokenById
 * @property {(id: string, patch: object) => Promise<object>} updateRefreshToken
 * @property {(sessionId: string) => Promise<number>} revokeRefreshTokensForSession
 * @property {(entry: object) => Promise<object>} appendAudit
 * @property {(filter?: object) => Promise<object[]>} listAudit
 */

module.exports = { AuthStoreToken };
