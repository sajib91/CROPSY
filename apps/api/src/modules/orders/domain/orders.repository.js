const { defineRepositoryToken } = require('../../../shared/domain/repository');

const OrdersRepositoryToken = defineRepositoryToken('orders');

/**
 * Repository port for Orders.
 * @typedef {object} OrdersRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

module.exports = { OrdersRepositoryToken };
