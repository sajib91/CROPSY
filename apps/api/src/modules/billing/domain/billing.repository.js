const { defineRepositoryToken } = require('../../../shared/domain/repository');

const BillingRepositoryToken = defineRepositoryToken('billing');

/**
 * Repository port for Subscription and SaaS Billing.
 * @typedef {object} BillingRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { BillingRepositoryToken };
