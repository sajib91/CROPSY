const { defineRepositoryToken } = require('../../../shared/domain/repository');

const AnalyticsRepositoryToken = defineRepositoryToken('analytics');

/**
 * Shared report-data port. Implementations return historical rows only; every
 * aggregate and projection is computed by the application service so memory
 * and Prisma adapters cannot disagree about metric semantics.
 *
 * @typedef {object} AnalyticsStoreContract
 * @property {(input: {
 *   report: string,
 *   organizationId: string|null,
 *   actorUserId: string|null,
 *   isOrganizationAdmin: boolean,
 *   query: { from: Date, to: Date, grain: string, limit: number },
 * }) => Promise<object[]>} readReport
 */
const AnalyticsStoreToken = defineRepositoryToken('analyticsStore');

module.exports = { AnalyticsRepositoryToken, AnalyticsStoreToken };
