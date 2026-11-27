const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const { ConflictError, NotFoundError } = require('../../../shared/kernel/errors');
const { ORDERS_STORE_METHODS, OrdersStoreToken } = require('../domain/orders.repository');

const COLLECTIONS = Object.freeze([
  'carts',
  'cartItems',
  'purchaseGroups',
  'orders',
  'orderItems',
  'statusChanges',
]);

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return new Date();
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function matches(record, filters = {}) {
  return Object.entries(filters).every(([key, value]) => {
    if (['limit', 'offset'].includes(key)) return true;
    if (value === undefined || value === null) return true;
    if (key === 'statuses') return value.includes(record.status);
    if (key === 'since') return record.placed_at >= value;
    if (key === 'until') return record.placed_at <= value;
    return record[key] === value;
  });
}

/**
 * In-process orders store. Records mirror the Prisma adapter's snake_case
 * shape. JavaScript event-loop serialization makes checkout mutations atomic;
 * the Prisma adapter uses SQL row locks and database transactions instead.
 */
class OrdersInMemoryStore {
  constructor({ listingStock } = {}) {
    for (const name of COLLECTIONS) this[name] = new Map();
    this.purchaseGroupByReference = new Map();
    this.listingStock = listingStock;
    if (listingStock) {
      assertRepository(
        listingStock,
        ['decrementAvailability', 'restoreAvailability'],
        'MarketplaceListingStock',
      );
    }
    assertRepository(this, ORDERS_STORE_METHODS, OrdersStoreToken);
  }

  _activeCart({ userId, organizationId }) {
    return [...this.carts.values()].find(
      (cart) =>
        cart.user_id === userId &&
        cart.organization_id === organizationId &&
        cart.status === 'ACTIVE',
    );
  }

  _cartWithItems(cart) {
    if (!cart) return null;
    const items = [...this.cartItems.values()]
      .filter((item) => item.cart_id === cart.id)
      .sort((left, right) => left.created_at - right.created_at);
    return clone({ ...cart, items });
  }

  _itemsFor(order) {
    return [...this.orderItems.values()]
      .filter((item) => item.order_id === order.id)
      .sort((left, right) => left.created_at - right.created_at);
  }

  _orderWithItems(order) {
    if (!order) return null;
    const group = order.purchase_group_id
      ? this.purchaseGroups.get(order.purchase_group_id) || null
      : null;
    return clone({
      ...order,
      items: this._itemsFor(order),
      purchase_group: group ? { ...group } : null,
    });
  }

  _groupWithOrders(group) {
    if (!group) return null;
    const orders = [...this.orders.values()]
      .filter((order) => order.purchase_group_id === group.id)
      .sort((left, right) => left.placed_at - right.placed_at)
      .map((order) => this._orderWithItems(order));
    return clone({ ...group, orders });
  }

  _syncPurchaseGroup(group) {
    const orders = [...this.orders.values()].filter(
      (order) => order.purchase_group_id === group.id,
    );
    if (orders.length === 0) return;
    let status = 'PENDING';
    if (orders.every((order) => order.status === 'CANCELLED')) status = 'CANCELLED';
    else if (orders.every((order) => order.status === 'COMPLETED')) status = 'COMPLETED';
    else if (
      orders.some((order) =>
        ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status),
      )
    ) {
      status = 'CONFIRMED';
    }
    group.status = status;
    if (status === 'CANCELLED' && !group.cancelled_at) group.cancelled_at = now();
    group.updated_at = now();
  }

  getCart(filters) {
    return Promise.resolve(this._cartWithItems(this._activeCart(filters)));
  }

  upsertCartItem(input) {
    let cart = this._activeCart({
      userId: input.user_id,
      organizationId: input.organization_id ?? null,
    });
    if (!cart) {
      cart = {
        id: randomUUID(),
        organization_id: input.organization_id ?? null,
        user_id: input.user_id,
        status: 'ACTIVE',
        currency: input.currency || 'BDT',
        created_at: now(),
        updated_at: now(),
      };
      this.carts.set(cart.id, cart);
    }

    const existing = [...this.cartItems.values()].find(
      (item) => item.cart_id === cart.id && item.listing_id === input.listing_id,
    );
    if (existing) {
      Object.assign(existing, {
        quantity: Number(input.quantity),
        unit_price_snapshot: money(input.unit_price),
        currency: input.currency || existing.currency,
        updated_at: now(),
      });
      this.cartItems.set(existing.id, existing);
    } else {
      const item = {
        id: randomUUID(),
        cart_id: cart.id,
        listing_id: input.listing_id,
        quantity: Number(input.quantity),
        unit_price_snapshot: money(input.unit_price),
        currency: input.currency || cart.currency,
        created_at: now(),
        updated_at: now(),
      };
      this.cartItems.set(item.id, item);
    }
    cart.updated_at = now();
    return Promise.resolve(this._cartWithItems(cart));
  }

  deleteCartItem(input) {
    const cart = this._activeCart({
      userId: input.user_id,
      organizationId: input.organization_id ?? null,
    });
    if (!cart) return Promise.resolve(null);
    const item = [...this.cartItems.values()].find(
      (candidate) => candidate.cart_id === cart.id && candidate.listing_id === input.listing_id,
    );
    if (!item) return Promise.resolve(null);
    this.cartItems.delete(item.id);
    cart.updated_at = now();
    return Promise.resolve(this._cartWithItems(cart));
  }

  findPurchaseGroupByReference(referenceKey) {
    const groupId = this.purchaseGroupByReference.get(referenceKey);
    const group = groupId ? this.purchaseGroups.get(groupId) : null;
    return Promise.resolve(this._groupWithOrders(group));
  }

  findPurchaseGroup(filters = {}) {
    const group = [...this.purchaseGroups.values()].find((candidate) =>
      matches(candidate, filters),
    );
    return Promise.resolve(this._groupWithOrders(group));
  }

  listPurchaseGroups(filters = {}) {
    let groups = [...this.purchaseGroups.values()].filter((group) => matches(group, filters));
    groups.sort((left, right) => right.placed_at - left.placed_at);
    groups = groups.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50));
    return Promise.resolve(groups.map((group) => this._groupWithOrders(group)));
  }

  async createCheckout(input) {
    const duplicateId = this.purchaseGroupByReference.get(input.reference_key);
    const duplicate = duplicateId ? this.purchaseGroups.get(duplicateId) : null;
    if (duplicate) {
      if (
        duplicate.buyer_user_id !== input.buyer_user_id ||
        duplicate.organization_id !== (input.organization_id ?? null)
      ) {
        throw new ConflictError({ message: 'Checkout reference key is already in use.' });
      }
      return this._groupWithOrders(duplicate);
    }

    const reserved = [];
    try {
      for (const order of input.orders) {
        for (const item of order.items) {
          if (this.listingStock) {
            await this.listingStock.decrementAvailability(item.listing_id, item.quantity);
          }
          reserved.push({ listingId: item.listing_id, quantity: item.quantity });
        }
      }

      const group = {
        id: randomUUID(),
        organization_id: input.organization_id ?? null,
        buyer_user_id: input.buyer_user_id,
        cart_id: input.cart_id ?? null,
        reference_key: input.reference_key,
        status: 'PENDING',
        currency: input.currency,
        subtotal_amount: money(input.subtotal_amount),
        discount_amount: money(input.discount_amount),
        delivery_fee_amount: money(input.delivery_fee_amount),
        tax_amount: money(input.tax_amount || 0),
        total_amount: money(input.total_amount),
        pricing_snapshot: clone(input.pricing_snapshot || {}),
        placed_at: now(),
        cancelled_at: null,
        created_at: now(),
        updated_at: now(),
      };
      this.purchaseGroups.set(group.id, group);
      this.purchaseGroupByReference.set(group.reference_key, group.id);

      for (const source of input.orders) {
        const order = {
          id: randomUUID(),
          organization_id: group.organization_id,
          purchase_group_id: group.id,
          cart_id: group.cart_id,
          buyer_user_id: group.buyer_user_id,
          seller_user_id: source.seller_user_id,
          status: 'PENDING',
          currency: input.currency,
          subtotal_amount: money(source.subtotal_amount),
          discount_amount: money(source.discount_amount),
          delivery_fee_amount: money(source.delivery_fee_amount),
          tax_amount: money(source.tax_amount || 0),
          total_amount: money(source.total_amount),
          pricing_snapshot: clone(source.pricing_snapshot || {}),
          placed_at: group.placed_at,
          confirmed_at: null,
          completed_at: null,
          cancelled_at: null,
          created_at: now(),
          updated_at: now(),
        };
        this.orders.set(order.id, order);

        for (const line of source.items) {
          const item = {
            id: randomUUID(),
            order_id: order.id,
            product_id: line.product_id,
            listing_id: line.listing_id,
            quantity: Number(line.quantity),
            unit_price: money(line.unit_price),
            line_total: money(line.line_total),
            currency: input.currency,
            created_at: now(),
            updated_at: now(),
          };
          this.orderItems.set(item.id, item);
        }

        const change = {
          id: randomUUID(),
          organization_id: group.organization_id,
          purchase_group_id: group.id,
          order_id: order.id,
          from_status: null,
          to_status: 'PENDING',
          reason: 'checkout',
          actor_user_id: input.actor_user_id || null,
          created_at: now(),
        };
        this.statusChanges.set(change.id, change);
      }

      const cart = this.carts.get(input.cart_id);
      if (cart) {
        cart.status = 'CHECKED_OUT';
        cart.updated_at = now();
      }

      return this._groupWithOrders(group);
    } catch (error) {
      for (let index = reserved.length - 1; index >= 0; index -= 1) {
        const entry = reserved[index];
        if (this.listingStock) {
          await this.listingStock.restoreAvailability(entry.listingId, entry.quantity);
        }
      }
      throw error;
    }
  }

  findOrder(filters = {}) {
    const order = [...this.orders.values()].find((candidate) => matches(candidate, filters));
    return Promise.resolve(this._orderWithItems(order));
  }

  listOrders(filters = {}) {
    let orders = [...this.orders.values()].filter((candidate) => matches(candidate, filters));
    orders.sort((left, right) => right.placed_at - left.placed_at);
    orders = orders.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50));
    return Promise.resolve(orders.map((order) => this._orderWithItems(order)));
  }

  async transitionOrder(input) {
    const order = this.orders.get(input.order_id);
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

    order.status = input.to_status;
    if (input.to_status === 'CONFIRMED' && !order.confirmed_at) order.confirmed_at = now();
    if (input.to_status === 'COMPLETED' && !order.completed_at) order.completed_at = now();
    if (input.to_status === 'CANCELLED' && !order.cancelled_at) order.cancelled_at = now();
    order.updated_at = now();

    if (input.to_status === 'CANCELLED' && input.restore_availability) {
      for (const item of this._itemsFor(order)) {
        if (this.listingStock) {
          await this.listingStock.restoreAvailability(item.listing_id, item.quantity);
        }
      }
    }

    const change = {
      id: randomUUID(),
      organization_id: order.organization_id,
      purchase_group_id: order.purchase_group_id,
      order_id: order.id,
      from_status: previous,
      to_status: input.to_status,
      reason: input.reason || null,
      actor_user_id: input.actor_user_id || null,
      created_at: now(),
    };
    this.statusChanges.set(change.id, change);

    const group = order.purchase_group_id ? this.purchaseGroups.get(order.purchase_group_id) : null;
    if (group) this._syncPurchaseGroup(group);
    return this._orderWithItems(order);
  }

  listStatusChanges(filters = {}) {
    let rows = [...this.statusChanges.values()].filter((row) => matches(row, filters));
    rows.sort((left, right) => right.created_at - left.created_at);
    rows = rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 100));
    return Promise.resolve(clone(rows));
  }
}

module.exports = { OrdersInMemoryStore };
