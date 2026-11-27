const { randomUUID } = require('node:crypto');

const { assertRepository } = require('../../../shared/domain/repository');
const {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../../shared/kernel/errors');
const { validate } = require('../../../shared/validation/validate');
const dto = require('./orders.dto');
const {
  CANCELLABLE_ORDER_STATUSES,
  EVENTS,
  MODULE_ID,
  ORDER_TRANSITIONS,
  OrdersEntity,
} = require('../domain/orders.entity');
const {
  ORDERS_STORE_METHODS,
  OrdersRepositoryToken,
  OrdersStoreToken,
} = require('../domain/orders.repository');

const OrdersServiceToken = Symbol.for('cropsy.service.orders');

const CATALOG_PORT_METHODS = Object.freeze(['findProduct']);
const MARKETPLACE_PORT_METHODS = Object.freeze(['findListing']);
const IDENTITY_METHODS = Object.freeze(['findUserById', 'appendAudit']);

function requestMeta(request) {
  return {
    ipAddress: request?.ip || null,
    userAgent: request?.headers?.['user-agent'] || null,
    requestId: request?.requestId || null,
  };
}

function requireRecord(record, label) {
  if (!record) throw new NotFoundError({ message: `${label} was not found.` });
  return record;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function timestamp(value) {
  return value instanceof Date ? value : new Date(value);
}

function hasPermission(context, permission) {
  return Boolean(context?.permissions?.includes(permission));
}

function toCartItemDto(item, listing = null) {
  return {
    id: item.id,
    listingId: item.listing_id,
    quantity: Number(item.quantity),
    unitPriceSnapshot: Number(item.unit_price_snapshot),
    currency: item.currency,
    listing: listing
      ? {
          id: listing.id,
          title: listing.title,
          sellerUserId: listing.seller_user_id,
          status: listing.status,
          unitPrice: Number(listing.unit_price),
          quantityAvailable: Number(listing.quantity_available),
          currency: listing.currency,
        }
      : null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toCartDto(cart, items) {
  if (!cart) {
    return {
      id: null,
      status: 'ACTIVE',
      currency: null,
      items: [],
      subtotalAmount: 0,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    items,
    subtotalAmount: roundMoney(
      items.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0),
    ),
    createdAt: cart.created_at,
    updatedAt: cart.updated_at,
  };
}

function toOrderItemDto(item) {
  return {
    id: item.id,
    productId: item.product_id,
    listingId: item.listing_id,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    lineTotal: Number(item.line_total),
    currency: item.currency,
  };
}

function toOrderDto(order) {
  if (!order) return null;
  return {
    id: order.id,
    checkoutId: order.purchase_group_id,
    cartId: order.cart_id,
    buyerUserId: order.buyer_user_id,
    sellerUserId: order.seller_user_id,
    status: order.status,
    currency: order.currency,
    subtotalAmount: Number(order.subtotal_amount),
    discountAmount: Number(order.discount_amount),
    deliveryFeeAmount: Number(order.delivery_fee_amount),
    taxAmount: Number(order.tax_amount),
    totalAmount: Number(order.total_amount),
    pricing: order.pricing_snapshot,
    items: (order.items || []).map(toOrderItemDto),
    placedAt: order.placed_at,
    confirmedAt: order.confirmed_at,
    completedAt: order.completed_at,
    cancelledAt: order.cancelled_at,
  };
}

function toCheckoutDto(group) {
  if (!group) return null;
  return {
    id: group.id,
    organizationId: group.organization_id,
    buyerUserId: group.buyer_user_id,
    cartId: group.cart_id,
    referenceKey: group.reference_key,
    status: group.status,
    currency: group.currency,
    subtotalAmount: Number(group.subtotal_amount),
    discountAmount: Number(group.discount_amount),
    deliveryFeeAmount: Number(group.delivery_fee_amount),
    taxAmount: Number(group.tax_amount),
    totalAmount: Number(group.total_amount),
    pricing: group.pricing_snapshot,
    orders: (group.orders || []).map(toOrderDto),
    placedAt: group.placed_at,
    cancelledAt: group.cancelled_at,
  };
}

function toHistoryDto(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    checkoutId: row.purchase_group_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
  };
}

function ruleFor(rules, type, sellerUserId) {
  const candidates = rules.filter((rule) => rule.type === type);
  const specific = candidates.filter((rule) => rule.sellerUserId === sellerUserId);
  const general = candidates.filter((rule) => !rule.sellerUserId);
  if (specific.length > 1 || (!specific.length && general.length > 1)) {
    throw new ValidationError({
      message: `At most one ${type} pricing rule may apply to a seller.`,
    });
  }
  return specific[0] || general[0] || null;
}

function ruleAmount(rule, subtotal, currency) {
  if (!rule) return 0;
  if (rule.currency && rule.currency !== currency) {
    throw new ValidationError({ message: 'Pricing rule currency does not match the checkout.' });
  }
  if (rule.mode === 'FLAT') return roundMoney(rule.amount);
  return roundMoney(subtotal * rule.percentage);
}

function mergeOrders(groups, limit, offset) {
  const unique = new Map();
  for (const rows of groups) {
    for (const row of rows) unique.set(row.id, row);
  }
  return [...unique.values()]
    .sort((left, right) => right.placed_at - left.placed_at)
    .slice(offset, offset + limit);
}

class OrdersService {
  constructor({
    repository,
    store,
    eventBus,
    logger,
    metadata,
    catalog,
    marketplace,
    identityStore,
    authorization,
    config,
  }) {
    assertRepository(repository, ['get', 'save'], OrdersRepositoryToken);
    assertRepository(store, ORDERS_STORE_METHODS, OrdersStoreToken);
    assertRepository(catalog, CATALOG_PORT_METHODS, 'CatalogAccessPort');
    assertRepository(marketplace, MARKETPLACE_PORT_METHODS, 'MarketplaceAccessPort');
    assertRepository(identityStore, IDENTITY_METHODS, 'IdentityStore');
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new TypeError('OrdersService requires an event bus.');
    }
    if (!metadata) throw new TypeError('OrdersService requires module metadata.');
    for (const [name, dependency] of Object.entries({ store, authorization, config })) {
      if (!dependency) throw new TypeError(`OrdersService requires ${name}.`);
    }
    this.repository = repository;
    this.store = store;
    this.eventBus = eventBus;
    this.logger = logger;
    this.metadata = metadata;
    this.catalog = catalog;
    this.marketplace = marketplace;
    this.identityStore = identityStore;
    this.authorization = authorization;
    this.config = config;
  }

  async describe() {
    let entity = await this.repository.get(MODULE_ID);
    if (!entity) {
      entity = new OrdersEntity();
      await this.repository.save(entity);
      this.publish(EVENTS.INITIALIZED, { name: entity.name }, entity.id);
      this.logger?.debug({ moduleId: MODULE_ID }, 'Module entity initialized');
    }
    const data = dto.toModuleInfoDto(entity, this.metadata);
    return validate(dto.moduleInfoSchema, data, 'orders module info');
  }

  publish(type, payload, entityId) {
    this.eventBus.publish({
      type,
      moduleId: MODULE_ID,
      aggregateId: entityId || payload?.checkoutId || payload?.orderId || 'anonymous',
      payload,
    });
  }

  async audit(
    { action, entityType, entityId, organizationId = null, before, after = {}, severity = 'INFO' },
    request,
  ) {
    const meta = requestMeta(request);
    const entry = {
      action,
      entityType,
      entityId: entityId || null,
      actorUserId: request?.auth?.user?.id || null,
      organizationId,
      before: before === undefined ? undefined : before,
      after: { ...after, ...(meta.requestId ? { requestId: meta.requestId } : {}) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      severity,
    };
    await this.identityStore.appendAudit(entry);
    this.publish(action, entry.after, entityId);
  }

  async resolveTenantId(context, explicit) {
    if (explicit) {
      if (!context.isSuperAdmin) await this.authorization.assertOrganization(context, explicit);
      return explicit;
    }
    if (context.isSuperAdmin) return null;
    if (!context.organizationId) return null;
    await this.authorization.assertOrganization(context, context.organizationId);
    return context.organizationId;
  }

  assertSameTenant(record, organizationId, label) {
    if (record.organization_id === null || record.organization_id === undefined) return record;
    if (record.organization_id !== organizationId) {
      throw new ForbiddenError({
        message: `${label} belongs to another organization.`,
        details: { code: 'cross_organization_access_denied' },
      });
    }
    return record;
  }

  assertCanViewGroup(context, group) {
    if (
      context.isSuperAdmin ||
      group.buyer_user_id === context.user?.id ||
      (group.organization_id &&
        group.organization_id === context.organizationId &&
        hasPermission(context, 'orders.manage'))
    ) {
      return group;
    }
    throw new ForbiddenError({ message: 'Checkout details are not accessible.' });
  }

  assertCanViewOrder(context, order) {
    if (this.canViewGroup(context, order) || order.seller_user_id === context.user?.id) {
      return order;
    }
    throw new ForbiddenError({ message: 'Order details are not accessible.' });
  }

  canViewGroup(context, group) {
    return Boolean(
      context.isSuperAdmin ||
      group.buyer_user_id === context.user?.id ||
      (group.organization_id &&
        group.organization_id === context.organizationId &&
        hasPermission(context, 'orders.manage')),
    );
  }

  assertCanMutateOrder(context, order) {
    if (
      context.isSuperAdmin ||
      order.buyer_user_id === context.user?.id ||
      (order.organization_id &&
        order.organization_id === context.organizationId &&
        hasPermission(context, 'orders.manage'))
    ) {
      return order;
    }
    throw new ForbiddenError({ message: 'Order cannot be modified by this user.' });
  }

  async requireAvailableListing({ listingId, quantity, organizationId, currency }) {
    const listing = requireRecord(await this.marketplace.findListing(listingId), 'Listing');
    this.assertSameTenant(listing, organizationId, 'Listing');
    const product = requireRecord(await this.catalog.findProduct(listing.product_id), 'Product');
    this.assertSameTenant(product, organizationId, 'Product');
    const seller = requireRecord(
      await this.identityStore.findUserById(listing.seller_user_id),
      'Seller',
    );
    if (seller.account_status !== 'ACTIVE') {
      throw new ConflictError({ message: 'Seller is not available.' });
    }
    if (listing.status !== 'ACTIVE') {
      throw new ConflictError({ message: 'Listing is not active.' });
    }
    if (currency && listing.currency !== currency) {
      throw new ValidationError({ message: 'Cart contains mixed listing currencies.' });
    }

    const startsAt = listing.starts_at ? timestamp(listing.starts_at) : null;
    const endsAt = listing.ends_at ? timestamp(listing.ends_at) : null;
    const at = new Date();
    if (startsAt && Number.isNaN(startsAt.getTime())) {
      throw new ValidationError({ message: 'Listing start date is invalid.' });
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new ValidationError({ message: 'Listing end date is invalid.' });
    }
    if (startsAt && startsAt > at) {
      throw new ConflictError({ message: 'Listing is not available yet.' });
    }
    if (endsAt && endsAt < at) {
      throw new ConflictError({ message: 'Listing is no longer available.' });
    }
    if (quantity < Number(listing.min_order_quantity)) {
      throw new ValidationError({ message: 'Quantity is below the listing minimum.' });
    }
    if (quantity > Number(listing.quantity_available)) {
      throw new ConflictError({ message: 'Quantity exceeds available stock.' });
    }
    return { listing, product, seller };
  }

  async enrichCart(cart) {
    if (!cart) return toCartDto(null, []);
    const items = await Promise.all(
      (cart.items || []).map(async (item) => {
        const listing = await this.marketplace.findListing(item.listing_id);
        return toCartItemDto(item, listing);
      }),
    );
    return toCartDto(cart, items);
  }

  async getCart({ context, query }) {
    const value = validate(dto.cartQuerySchema, query || {}, 'cart query');
    const organizationId = await this.resolveTenantId(context, value.organizationId);
    const cart = await this.store.getCart({ userId: context.user.id, organizationId });
    return this.enrichCart(cart);
  }

  async addCartItem({ context, input, request }) {
    const value = validate(dto.cartItemCreateSchema, input, 'cart item input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const { listing } = await this.requireAvailableListing({
      listingId: value.listingId,
      quantity: value.quantity,
      organizationId,
      currency: value.currency,
    });
    const before = await this.store.getCart({ userId: context.user.id, organizationId });
    const cart = await this.store.upsertCartItem({
      user_id: context.user.id,
      organization_id: organizationId,
      listing_id: value.listingId,
      quantity: value.quantity,
      unit_price: Number(listing.unit_price),
      currency: listing.currency,
    });
    await this.audit(
      {
        action: EVENTS.CART_ITEM_ADDED,
        entityType: 'cart',
        entityId: cart.id,
        organizationId,
        before,
        after: { listingId: value.listingId, quantity: value.quantity },
      },
      request,
    );
    return this.enrichCart(cart);
  }

  async updateCartItem({ context, listingId, input, request }) {
    const params = validate(dto.listingParamsSchema, { listingId }, 'listing id');
    const value = validate(dto.cartItemUpdateSchema, input || {}, 'cart item update');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const before = await this.store.getCart({ userId: context.user.id, organizationId });
    if (!before || !(before.items || []).some((item) => item.listing_id === params.listingId)) {
      throw new NotFoundError({ message: 'Cart item was not found.' });
    }
    await this.requireAvailableListing({
      listingId: params.listingId,
      quantity: value.quantity,
      organizationId,
      currency: before.currency,
    });
    const cart = await this.store.upsertCartItem({
      user_id: context.user.id,
      organization_id: organizationId,
      listing_id: params.listingId,
      quantity: value.quantity,
      unit_price: Number((await this.marketplace.findListing(params.listingId)).unit_price),
      currency: before.currency,
    });
    await this.audit(
      {
        action: EVENTS.CART_ITEM_UPDATED,
        entityType: 'cart',
        entityId: cart.id,
        organizationId,
        before,
        after: { listingId: params.listingId, quantity: value.quantity },
      },
      request,
    );
    return this.enrichCart(cart);
  }

  async removeCartItem({ context, listingId, request }) {
    const params = validate(dto.listingParamsSchema, { listingId }, 'listing id');
    const organizationId = await this.resolveTenantId(context, null);
    const before = await this.store.getCart({ userId: context.user.id, organizationId });
    const cart = await this.store.deleteCartItem({
      user_id: context.user.id,
      organization_id: organizationId,
      listing_id: params.listingId,
    });
    if (!cart || !before) throw new NotFoundError({ message: 'Cart item was not found.' });
    await this.audit(
      {
        action: EVENTS.CART_ITEM_REMOVED,
        entityType: 'cart',
        entityId: cart.id,
        organizationId,
        before,
        after: { listingId: params.listingId },
      },
      request,
    );
    return this.enrichCart(cart);
  }

  assertReferenceOwner(group, input) {
    if (!group) return;
    if (
      group.buyer_user_id !== input.buyer_user_id ||
      group.organization_id !== (input.organization_id ?? null)
    ) {
      throw new ConflictError({ message: 'Checkout reference key is already in use.' });
    }
  }

  async createCheckout({ context, input, request }) {
    const value = validate(dto.checkoutSchema, input || {}, 'checkout input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const existing = await this.store.findPurchaseGroupByReference(value.referenceKey);
    this.assertReferenceOwner(existing, {
      buyer_user_id: context.user.id,
      organization_id: organizationId,
    });
    if (existing) return toCheckoutDto(existing);

    const cart = await this.store.getCart({ userId: context.user.id, organizationId });
    requireRecord(cart, 'Active cart');
    if (cart.status !== 'ACTIVE') {
      throw new ConflictError({ message: 'Cart has already been checked out.' });
    }
    if (!cart.items || cart.items.length === 0) {
      throw new ValidationError({ message: 'Cart is empty.' });
    }

    const currency = cart.currency;
    // Discounts and delivery fees are business policy. They must come from a
    // trusted server-side source; accepting them from the buyer lets any
    // checkout reduce its own total to zero.
    const pricingRules = [];
    const sellerOrders = new Map();
    for (const item of cart.items) {
      const { listing } = await this.requireAvailableListing({
        listingId: item.listing_id,
        quantity: Number(item.quantity),
        organizationId,
        currency,
      });
      const unitPrice = Number(listing.unit_price);
      const lineTotal = roundMoney(Number(item.quantity) * unitPrice);
      if (!sellerOrders.has(listing.seller_user_id)) {
        sellerOrders.set(listing.seller_user_id, {
          seller_user_id: listing.seller_user_id,
          items: [],
          subtotal_amount: 0,
        });
      }
      const sellerOrder = sellerOrders.get(listing.seller_user_id);
      sellerOrder.items.push({
        product_id: listing.product_id,
        listing_id: listing.id,
        quantity: Number(item.quantity),
        unit_price: unitPrice,
        line_total: lineTotal,
      });
      sellerOrder.subtotal_amount = roundMoney(sellerOrder.subtotal_amount + lineTotal);
    }

    const orders = [];
    let groupSubtotal = 0;
    let groupDiscount = 0;
    let groupDelivery = 0;
    for (const sellerOrder of sellerOrders.values()) {
      const deliveryRule = ruleFor(pricingRules, 'DELIVERY', sellerOrder.seller_user_id);
      const discountRule = ruleFor(pricingRules, 'DISCOUNT', sellerOrder.seller_user_id);
      const discountAmount = ruleAmount(discountRule, sellerOrder.subtotal_amount, currency);
      if (discountAmount > sellerOrder.subtotal_amount) {
        throw new ValidationError({ message: 'Discount exceeds the seller subtotal.' });
      }
      const deliveryFeeAmount = ruleAmount(deliveryRule, sellerOrder.subtotal_amount, currency);
      const totalAmount = roundMoney(
        sellerOrder.subtotal_amount - discountAmount + deliveryFeeAmount,
      );
      const computed = {
        subtotalAmount: sellerOrder.subtotal_amount,
        discountAmount,
        deliveryFeeAmount,
        taxAmount: 0,
        totalAmount,
      };
      orders.push({
        seller_user_id: sellerOrder.seller_user_id,
        ...sellerOrder,
        discount_amount: discountAmount,
        delivery_fee_amount: deliveryFeeAmount,
        tax_amount: 0,
        total_amount: totalAmount,
        pricing_snapshot: {
          sellerUserId: sellerOrder.seller_user_id,
          rules: [deliveryRule, discountRule].filter(Boolean),
          computed,
          linePrices: sellerOrder.items,
        },
      });
      groupSubtotal = roundMoney(groupSubtotal + sellerOrder.subtotal_amount);
      groupDiscount = roundMoney(groupDiscount + discountAmount);
      groupDelivery = roundMoney(groupDelivery + deliveryFeeAmount);
    }
    const groupTotal = roundMoney(groupSubtotal - groupDiscount + groupDelivery);
    const pricingSnapshot = {
      rules: pricingRules,
      computed: {
        subtotalAmount: groupSubtotal,
        discountAmount: groupDiscount,
        deliveryFeeAmount: groupDelivery,
        taxAmount: 0,
        totalAmount: groupTotal,
      },
      derivedFrom: 'server-calculated-cart-lines',
    };

    const groupId = randomUUID();
    const checkoutInput = {
      group_id: groupId,
      reference_key: value.referenceKey,
      organization_id: organizationId,
      buyer_user_id: context.user.id,
      cart_id: cart.id,
      currency,
      subtotal_amount: groupSubtotal,
      discount_amount: groupDiscount,
      delivery_fee_amount: groupDelivery,
      tax_amount: 0,
      total_amount: groupTotal,
      pricing_snapshot: pricingSnapshot,
      actor_user_id: context.user.id,
      orders,
    };

    let group;
    try {
      group = await this.store.createCheckout(checkoutInput);
    } catch (error) {
      if (error instanceof ConflictError) {
        const raced = await this.store.findPurchaseGroupByReference(value.referenceKey);
        this.assertReferenceOwner(raced, {
          buyer_user_id: context.user.id,
          organization_id: organizationId,
        });
        if (raced) return toCheckoutDto(raced);
      }
      throw error;
    }

    await this.audit(
      {
        action: EVENTS.CHECKOUT_CREATED,
        entityType: 'purchase_group',
        entityId: group.id,
        organizationId,
        after: { referenceKey: group.reference_key, totalAmount: group.total_amount },
      },
      request,
    );
    for (const order of group.orders || []) {
      this.publish(
        EVENTS.ORDER_CREATED,
        { checkoutId: group.id, orderId: order.id, sellerUserId: order.seller_user_id },
        order.id,
      );
    }
    return toCheckoutDto(group);
  }

  async getCheckout({ context, checkoutId }) {
    const params = validate(dto.checkoutParamsSchema, { checkoutId }, 'checkout id');
    const organizationId = await this.resolveTenantId(context, null);
    const group = await this.store.findPurchaseGroup({
      id: params.checkoutId,
      organization_id: organizationId ?? undefined,
    });
    requireRecord(group, 'Checkout');
    this.assertCanViewGroup(context, group);
    return toCheckoutDto(group);
  }

  async listCheckouts({ context, query }) {
    const value = validate(
      dto.listOrdersQuerySchema.omit({ status: true, purchaseGroupId: true }).strict(),
      query || {},
      'checkout query',
    );
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const filters = {
      organization_id: organizationId ?? undefined,
      limit: value.limit,
      offset: value.offset,
    };
    if (!context.isSuperAdmin) filters.buyer_user_id = context.user.id;
    const groups = await this.store.listPurchaseGroups(filters);
    return groups.map(toCheckoutDto);
  }

  async listOrders({ context, query }) {
    const value = validate(dto.listOrdersQuerySchema, query || {}, 'order query');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const filters = {
      organization_id: organizationId ?? undefined,
      limit: 10000,
      offset: 0,
    };
    if (value.status) filters.status = value.status;
    if (value.purchaseGroupId) filters.purchase_group_id = value.purchaseGroupId;

    if (context.isSuperAdmin) {
      const orders = await this.store.listOrders({
        ...filters,
        limit: value.limit,
        offset: value.offset,
      });
      return orders.map(toOrderDto);
    }
    const [buyerOrders, sellerOrders] = await Promise.all([
      this.store.listOrders({ ...filters, buyer_user_id: context.user.id }),
      this.store.listOrders({ ...filters, seller_user_id: context.user.id }),
    ]);
    return mergeOrders([buyerOrders, sellerOrders], value.limit, value.offset).map(toOrderDto);
  }

  async getOrder({ context, orderId }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const organizationId = await this.resolveTenantId(context, null);
    const order = await this.store.findOrder({
      id: params.orderId,
      organization_id: organizationId ?? undefined,
    });
    requireRecord(order, 'Order');
    this.assertCanViewOrder(context, order);
    return toOrderDto(order);
  }

  async requireOrderForMutation({ context, orderId, organizationId }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const order = await this.store.findOrder({
      id: params.orderId,
      organization_id: organizationId ?? undefined,
    });
    requireRecord(order, 'Order');
    this.assertCanMutateOrder(context, order);
    return order;
  }

  async transitionOrder({ context, orderId, input, request }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const value = validate(dto.transitionSchema, input || {}, 'order transition input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const order = await this.requireOrderForMutation({ context, orderId, organizationId });
    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(value.toStatus)) {
      throw new ConflictError({
        message: `Order cannot transition from ${order.status} to ${value.toStatus}.`,
      });
    }
    const updated = await this.store.transitionOrder({
      order_id: params.orderId,
      organization_id: organizationId,
      expected_statuses: [order.status],
      to_status: value.toStatus,
      reason: value.reason || null,
      actor_user_id: context.user.id,
      restore_availability: value.toStatus === 'CANCELLED',
    });
    const action =
      value.toStatus === 'CANCELLED' ? EVENTS.ORDER_CANCELLED : EVENTS.ORDER_TRANSITIONED;
    await this.audit(
      {
        action,
        entityType: 'order',
        entityId: updated.id,
        organizationId,
        before: { status: order.status },
        after: { status: updated.status, reason: value.reason || null },
      },
      request,
    );
    return toOrderDto(updated);
  }

  async cancelOrder({ context, orderId, input, request }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const value = validate(dto.cancelSchema, input || {}, 'order cancellation input');
    const organizationId = await this.resolveTenantId(context, value.organizationId ?? null);
    const order = await this.requireOrderForMutation({ context, orderId, organizationId });
    if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictError({ message: `Order in ${order.status} cannot be cancelled.` });
    }
    const updated = await this.store.transitionOrder({
      order_id: params.orderId,
      organization_id: organizationId,
      expected_statuses: [order.status],
      to_status: 'CANCELLED',
      reason: value.reason || null,
      actor_user_id: context.user.id,
      restore_availability: true,
    });
    await this.audit(
      {
        action: EVENTS.ORDER_CANCELLED,
        entityType: 'order',
        entityId: updated.id,
        organizationId,
        before: { status: order.status },
        after: { status: updated.status, reason: value.reason || null },
      },
      request,
    );
    return toOrderDto(updated);
  }

  async orderHistory({ context, orderId, query }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const value = validate(dto.historyQuerySchema, query || {}, 'history query');
    const organizationId = await this.resolveTenantId(context, null);
    const order = await this.store.findOrder({
      id: params.orderId,
      organization_id: organizationId ?? undefined,
    });
    requireRecord(order, 'Order');
    this.assertCanViewOrder(context, order);
    const rows = await this.store.listStatusChanges({
      order_id: order.id,
      limit: value.limit,
      offset: value.offset,
    });
    return rows.map(toHistoryDto);
  }

  async orderReceipt({ context, orderId, request }) {
    const params = validate(dto.orderParamsSchema, { orderId }, 'order id');
    const organizationId = await this.resolveTenantId(context, null);
    const order = await this.store.findOrder({
      id: params.orderId,
      organization_id: organizationId ?? undefined,
    });
    requireRecord(order, 'Order');
    this.assertCanViewGroup(
      context,
      order.purchase_group || { buyer_user_id: order.buyer_user_id },
    );
    const group = order.purchase_group;
    const receipt = {
      receiptId: order.id,
      referenceKey: group?.reference_key || null,
      checkoutId: group?.id || null,
      placedAt: order.placed_at,
      generatedAt: new Date().toISOString(),
      status: order.status,
      buyerUserId: order.buyer_user_id,
      sellerUserId: order.seller_user_id,
      currency: order.currency,
      checkout: group
        ? {
            id: group.id,
            status: group.status,
            subtotalAmount: Number(group.subtotal_amount),
            discountAmount: Number(group.discount_amount),
            deliveryFeeAmount: Number(group.delivery_fee_amount),
            totalAmount: Number(group.total_amount),
          }
        : null,
      order: {
        id: order.id,
        subtotalAmount: Number(order.subtotal_amount),
        discountAmount: Number(order.discount_amount),
        deliveryFeeAmount: Number(order.delivery_fee_amount),
        taxAmount: Number(order.tax_amount),
        totalAmount: Number(order.total_amount),
      },
      items: (order.items || []).map(toOrderItemDto),
      pricing: order.pricing_snapshot,
    };
    await this.audit(
      {
        action: EVENTS.RECEIPT_GENERATED,
        entityType: 'order_receipt',
        entityId: order.id,
        organizationId: order.organization_id,
        after: { checkoutId: group?.id || null },
      },
      request,
    );
    return receipt;
  }
}

module.exports = { EVENTS, OrdersService, OrdersServiceToken };
