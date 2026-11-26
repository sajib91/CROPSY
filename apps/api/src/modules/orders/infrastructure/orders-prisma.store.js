const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { assertRepository } = require('../../../shared/domain/repository');
const { ORDERS_STORE_METHODS, OrdersStoreToken } = require('../domain/orders.repository');

function translateError(error) {
  if (error instanceof ConflictError || error instanceof NotFoundError) return error;
  if (error?.code === 'P2002') {
    return new ConflictError({ message: 'An orders reference is already in use.' });
  }
  if (error?.code === 'P2025') {
    return new NotFoundError({ message: 'Orders record was not found.' });
  }
  if (error?.code === 'P2010' || error?.code === 'P2014') {
    const databaseCode = String(error?.meta?.code || '');
    if (['23503', '23514', '22004', '22023'].includes(databaseCode)) {
      return new ConflictError({
        message: error?.meta?.message || error?.message || 'Order operation was rejected.',
      });
    }
  }
  return error;
}

function normalize(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) result[key] = normalize(entry);
    return result;
  }
  return value;
}

function whereFrom(filters = {}) {
  const where = {};
  for (const [key, value] of Object.entries(filters)) {
    if (['limit', 'offset'].includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (key === 'statuses') {
      where.status = { in: [...value] };
    } else if (key === 'since') {
      where.placed_at = { ...(where.placed_at || {}), gte: value };
    } else if (key === 'until') {
      where.placed_at = { ...(where.placed_at || {}), lte: value };
    } else if (Array.isArray(value)) {
      where[key] = { in: value };
    } else {
      where[key] = value;
    }
  }
  return where;
}

const GROUP_INCLUDE = Object.freeze({
  orders: { include: { items: true }, orderBy: { placed_at: 'asc' } },
});

const ORDER_INCLUDE = Object.freeze({ items: true, purchase_group: true });

function assertDuplicateOwner(group, input) {
  if (
    group.buyer_user_id !== input.buyer_user_id ||
    group.organization_id !== (input.organization_id ?? null)
  ) {
    throw new ConflictError({ message: 'Checkout reference key is already in use.' });
  }
}

function derivedCheckoutStatus(orders) {
  if (orders.length === 0) return 'PENDING';
  if (orders.every((order) => order.status === 'CANCELLED')) return 'CANCELLED';
  if (orders.every((order) => order.status === 'COMPLETED')) return 'COMPLETED';
  if (
    orders.some((order) =>
      ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status),
    )
  ) {
    return 'CONFIRMED';
  }
  return 'PENDING';
}

class OrdersPrismaStore {
  constructor({ prisma }) {
    if (!prisma) throw new TypeError('OrdersPrismaStore requires a Prisma client.');
    this.prisma = prisma;
    assertRepository(this, ORDERS_STORE_METHODS, OrdersStoreToken);
  }

  async _reloadGroup(transaction, id) {
    const record = await transaction.purchaseGroup.findUnique({
      where: { id },
      include: GROUP_INCLUDE.orders,
    });
    return normalize(record);
  }

  async _reloadOrder(transaction, id) {
    const record = await transaction.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    return normalize(record);
  }

  async getCart({ userId, organizationId }) {
    try {
      const cart = await this.prisma.cart.findFirst({
        where: {
          user_id: userId,
          organization_id: organizationId ?? null,
          status: 'ACTIVE',
        },
        include: { items: { orderBy: { created_at: 'asc' } } },
      });
      return normalize(cart);
    } catch (error) {
      throw translateError(error);
    }
  }

  async upsertCartItem(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        let cart = await transaction.cart.findFirst({
          where: {
            user_id: input.user_id,
            organization_id: input.organization_id ?? null,
            status: 'ACTIVE',
          },
        });
        if (!cart) {
          cart = await transaction.cart.create({
            data: {
              user_id: input.user_id,
              organization_id: input.organization_id ?? null,
              currency: input.currency || 'BDT',
              status: 'ACTIVE',
            },
          });
        }
        await transaction.cartItem.upsert({
          where: {
            cart_id_listing_id: { cart_id: cart.id, listing_id: input.listing_id },
          },
          create: {
            cart_id: cart.id,
            listing_id: input.listing_id,
            quantity: input.quantity,
            unit_price_snapshot: input.unit_price,
            currency: input.currency || cart.currency,
          },
          update: {
            quantity: input.quantity,
            unit_price_snapshot: input.unit_price,
            currency: input.currency || cart.currency,
          },
        });
        const fresh = await transaction.cart.findUnique({
          where: { id: cart.id },
          include: { items: { orderBy: { created_at: 'asc' } } },
        });
        return normalize(fresh);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async deleteCartItem(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const cart = await transaction.cart.findFirst({
          where: {
            user_id: input.user_id,
            organization_id: input.organization_id ?? null,
            status: 'ACTIVE',
          },
        });
        if (!cart) return null;
        await transaction.cartItem.deleteMany({
          where: { cart_id: cart.id, listing_id: input.listing_id },
        });
        const fresh = await transaction.cart.findUnique({
          where: { id: cart.id },
          include: { items: { orderBy: { created_at: 'asc' } } },
        });
        return normalize(fresh);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPurchaseGroupByReference(referenceKey) {
    try {
      const group = await this.prisma.purchaseGroup.findUnique({
        where: { reference_key: referenceKey },
        include: GROUP_INCLUDE.orders,
      });
      return normalize(group);
    } catch (error) {
      throw translateError(error);
    }
  }

  async findPurchaseGroup(filters = {}) {
    try {
      const group = await this.prisma.purchaseGroup.findFirst({
        where: whereFrom(filters),
        include: GROUP_INCLUDE.orders,
      });
      return normalize(group);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listPurchaseGroups(filters = {}) {
    try {
      const rows = await this.prisma.purchaseGroup.findMany({
        where: whereFrom(filters),
        include: GROUP_INCLUDE.orders,
        orderBy: { placed_at: 'desc' },
        skip: filters.offset || 0,
        take: filters.limit || 50,
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async createCheckout(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.purchaseGroup.findUnique({
          where: { reference_key: input.reference_key },
          include: GROUP_INCLUDE.orders,
        });
        if (duplicate) {
          assertDuplicateOwner(normalize(duplicate), input);
          return normalize(duplicate);
        }

        await transaction.purchaseGroup.create({
          data: {
            id: input.group_id,
            organization_id: input.organization_id ?? null,
            buyer_user_id: input.buyer_user_id,
            cart_id: input.cart_id ?? null,
            reference_key: input.reference_key,
            currency: input.currency,
            subtotal_amount: input.subtotal_amount,
            discount_amount: input.discount_amount,
            delivery_fee_amount: input.delivery_fee_amount,
            tax_amount: input.tax_amount || 0,
            total_amount: input.total_amount,
            pricing_snapshot: input.pricing_snapshot || {},
          },
        });

        for (const source of input.orders) {
          const order = await transaction.order.create({
            data: {
              organization_id: input.organization_id ?? null,
              purchase_group_id: input.group_id,
              cart_id: input.cart_id ?? null,
              buyer_user_id: input.buyer_user_id,
              seller_user_id: source.seller_user_id,
              currency: input.currency,
              subtotal_amount: source.subtotal_amount,
              discount_amount: source.discount_amount,
              delivery_fee_amount: source.delivery_fee_amount,
              tax_amount: source.tax_amount || 0,
              total_amount: source.total_amount,
              pricing_snapshot: source.pricing_snapshot || {},
            },
          });

          await transaction.orderItem.createMany({
            data: source.items.map((line) => ({
              order_id: order.id,
              product_id: line.product_id,
              listing_id: line.listing_id,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_total: line.line_total,
              currency: input.currency,
            })),
          });

          await transaction.orderStatusChange.create({
            data: {
              organization_id: input.organization_id ?? null,
              purchase_group_id: input.group_id,
              order_id: order.id,
              from_status: null,
              to_status: 'PENDING',
              reason: 'checkout',
              actor_user_id: input.actor_user_id || null,
            },
          });

          for (const line of source.items) {
            await transaction.$executeRaw`
              SELECT "cropsy_decrement_listing_availability"(
                ${line.listing_id}::uuid, ${line.quantity}::numeric
              )
            `;
          }
        }

        await transaction.cart.update({
          where: { id: input.cart_id },
          data: { status: 'CHECKED_OUT' },
        });

        return this._reloadGroup(transaction, input.group_id);
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        const existing = await this.findPurchaseGroupByReference(input.reference_key);
        if (existing) {
          assertDuplicateOwner(existing, input);
          return existing;
        }
      }
      throw translateError(error);
    }
  }

  async findOrder(filters = {}) {
    try {
      const order = await this.prisma.order.findFirst({
        where: whereFrom(filters),
        include: ORDER_INCLUDE,
      });
      return normalize(order);
    } catch (error) {
      throw translateError(error);
    }
  }

  async listOrders(filters = {}) {
    try {
      const rows = await this.prisma.order.findMany({
        where: whereFrom(filters),
        include: ORDER_INCLUDE,
        orderBy: { placed_at: 'desc' },
        skip: filters.offset || 0,
        take: filters.limit || 50,
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }

  async transitionOrder(input) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const order = await transaction.order.findUnique({
          where: { id: input.order_id },
          include: { items: true },
        });
        if (!order) throw new NotFoundError({ message: 'Order was not found.' });
        if (input.organization_id !== undefined && input.organization_id !== null) {
          if (order.organization_id !== input.organization_id) {
            throw new NotFoundError({ message: 'Order was not found.' });
          }
        }
        const previous = order.status;
        if (input.expected_statuses && !input.expected_statuses.includes(previous)) {
          throw new ConflictError({ message: `Order cannot transition from ${previous}.` });
        }

        const now = new Date();
        const patch = { status: input.to_status };
        if (input.to_status === 'CONFIRMED' && !order.confirmed_at) patch.confirmed_at = now;
        if (input.to_status === 'COMPLETED' && !order.completed_at) patch.completed_at = now;
        if (input.to_status === 'CANCELLED' && !order.cancelled_at) patch.cancelled_at = now;
        await transaction.order.update({ where: { id: order.id }, data: patch });

        if (input.to_status === 'CANCELLED' && input.restore_availability) {
          for (const item of order.items) {
            await transaction.$executeRaw`
              SELECT "cropsy_restore_listing_availability"(
                ${item.listing_id}::uuid, ${item.quantity}::numeric
              )
            `;
          }
        }

        await transaction.orderStatusChange.create({
          data: {
            organization_id: order.organization_id,
            purchase_group_id: order.purchase_group_id,
            order_id: order.id,
            from_status: previous,
            to_status: input.to_status,
            reason: input.reason || null,
            actor_user_id: input.actor_user_id || null,
          },
        });

        if (order.purchase_group_id) {
          const siblings = await transaction.order.findMany({
            where: { purchase_group_id: order.purchase_group_id },
            select: { status: true },
          });
          const status = derivedCheckoutStatus(siblings.map((row) => normalize(row)));
          const groupPatch = { status };
          if (status === 'CANCELLED') groupPatch.cancelled_at = now;
          await transaction.purchaseGroup.update({
            where: { id: order.purchase_group_id },
            data: groupPatch,
          });
        }

        return this._reloadOrder(transaction, order.id);
      });
    } catch (error) {
      throw translateError(error);
    }
  }

  async listStatusChanges(filters = {}) {
    try {
      const rows = await this.prisma.orderStatusChange.findMany({
        where: whereFrom(filters),
        orderBy: { created_at: 'desc' },
        skip: filters.offset || 0,
        take: filters.limit || 100,
      });
      return rows.map(normalize);
    } catch (error) {
      throw translateError(error);
    }
  }
}

module.exports = { OrdersPrismaStore };
