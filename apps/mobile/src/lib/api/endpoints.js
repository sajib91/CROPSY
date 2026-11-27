import { contractPath } from '@cropsy/api-contracts';

/**
 * Central map of `/api/v1` routes used by the mobile app.
 *
 * Every address is resolved against the checked-in OpenAPI 3.1 contract, so a
 * renamed or removed backend route fails fast instead of silently drifting.
 * Business rules are never duplicated here; these are only stable addresses of
 * backend-owned capabilities.
 */
export const endpoints = {
  health: contractPath('GET', '/health'),
  version: contractPath('GET', '/version'),
  modules: contractPath('GET', '/modules'),

  auth: {
    registerEmail: contractPath('POST', '/iam/auth/register/email'),
    registerPhone: contractPath('POST', '/iam/auth/register/phone'),
    requestOtp: contractPath('POST', '/iam/auth/otp/request'),
    verifyOtp: contractPath('POST', '/iam/auth/otp/verify'),
    login: contractPath('POST', '/iam/auth/login'),
    loginOtp: contractPath('POST', '/iam/auth/login/otp'),
    refresh: contractPath('POST', '/iam/auth/refresh'),
    logout: contractPath('POST', '/iam/auth/logout'),
    me: contractPath('GET', '/iam/auth/me'),
    forgotPassword: contractPath('POST', '/iam/auth/forgot-password'),
    resetPassword: contractPath('POST', '/iam/auth/reset-password'),
    userSummary: (userId) => contractPath('GET', '/iam/auth/users/{userId}', { userId }),
    accessCheck: contractPath('GET', '/iam/auth/access/check'),
  },

  users: {
    me: contractPath('GET', '/users/me'),
    updateProfile: contractPath('PATCH', '/users/me/profile'),
    updateContact: contractPath('PATCH', '/users/me/contact'),
    addresses: contractPath('GET', '/users/me/addresses'),
    address: (addressId) => contractPath('PATCH', '/users/me/addresses/{addressId}', { addressId }),
    preferences: contractPath('GET', '/users/me/preferences'),
    roleProfiles: contractPath('GET', '/users/me/role-profiles'),
    roleProfile: (roleCode) =>
      contractPath('PUT', '/users/me/roles/{roleCode}/profile', { roleCode }),
    farmerProfile: contractPath('GET', '/users/me/farmer-profile'),
  },

  catalog: {
    products: contractPath('GET', '/catalog/products'),
    product: (productId) => contractPath('GET', '/catalog/products/{productId}', { productId }),
    categories: contractPath('GET', '/catalog/categories'),
    units: contractPath('GET', '/catalog/units'),
    qualityGrades: contractPath('GET', '/catalog/quality-grades'),
  },

  farmers: {
    divisions: contractPath('GET', '/farmers/geo/divisions'),
    districts: (divisionId) =>
      contractPath('GET', '/farmers/geo/divisions/{divisionId}/districts', {
        divisionId,
      }),
    upazilas: (districtId) =>
      contractPath('GET', '/farmers/geo/districts/{districtId}/upazilas', {
        districtId,
      }),
    unions: (upazilaId) =>
      contractPath('GET', '/farmers/geo/upazilas/{upazilaId}/unions', {
        upazilaId,
      }),
    farms: contractPath('GET', '/farmers/farms'),
    farm: (farmId) => contractPath('GET', '/farmers/farms/{farmId}', { farmId }),
    farmMap: contractPath('GET', '/farmers/farms/map'),
    farmSpatial: contractPath('GET', '/farmers/farms/spatial'),
    farmSoil: (farmId) => contractPath('GET', '/farmers/farms/{farmId}/soil', { farmId }),
    farmIrrigations: (farmId) =>
      contractPath('GET', '/farmers/farms/{farmId}/irrigations', { farmId }),
    farmParcels: (farmId) => contractPath('GET', '/farmers/farms/{farmId}/parcels', { farmId }),
    groups: contractPath('GET', '/farmers/groups'),
    group: (groupId) => contractPath('GET', '/farmers/groups/{groupId}', { groupId }),
    earnings: contractPath('GET', '/farmers/earnings/me'),
  },

  agriculture: {
    crops: contractPath('GET', '/agriculture/crops'),
    crop: (cropId) => contractPath('PATCH', '/agriculture/crops/{cropId}', { cropId }),
    cropVarieties: (cropId) =>
      contractPath('POST', '/agriculture/crops/{cropId}/varieties', { cropId }),
    varieties: contractPath('GET', '/agriculture/varieties'),
    seasons: contractPath('GET', '/agriculture/seasons'),
    calendars: contractPath('GET', '/agriculture/calendars'),
    cultivations: contractPath('GET', '/agriculture/cultivations'),
    cultivation: (cultivationId) =>
      contractPath('GET', '/agriculture/cultivations/{cultivationId}', {
        cultivationId,
      }),
    cultivationCost: (cultivationId) =>
      contractPath('GET', '/agriculture/cultivations/{cultivationId}/cost', {
        cultivationId,
      }),
    expenses: contractPath('GET', '/agriculture/expenses'),
    farmExpenses: (farmId) =>
      contractPath('GET', '/agriculture/farms/{farmId}/expenses', { farmId }),
    farmHarvests: (farmId) =>
      contractPath('GET', '/agriculture/farms/{farmId}/harvests', { farmId }),
    farmActivities: (farmId) =>
      contractPath('GET', '/agriculture/farms/{farmId}/activities', { farmId }),
    recommendations: contractPath('GET', '/agriculture/recommendations'),
  },

  marketplace: {
    listings: contractPath('GET', '/marketplace/listings'),
    listing: (listingId) => contractPath('GET', '/marketplace/listings/{listingId}', { listingId }),
    deactivateListing: (listingId) =>
      contractPath('POST', '/marketplace/listings/{listingId}/deactivate', {
        listingId,
      }),
    favorites: contractPath('GET', '/marketplace/favorites'),
    favorite: (listingId) =>
      contractPath('POST', '/marketplace/favorites/{listingId}', { listingId }),
    seller: (sellerId) => contractPath('GET', '/marketplace/sellers/{sellerId}', { sellerId }),
    messages: contractPath('GET', '/marketplace/messages'),
    listingMessages: (listingId) =>
      contractPath('POST', '/marketplace/listings/{listingId}/messages', {
        listingId,
      }),
    markMessageRead: (messageId) =>
      contractPath('PATCH', '/marketplace/messages/{messageId}/read', {
        messageId,
      }),
    reports: contractPath('GET', '/marketplace/reports'),
  },

  orders: {
    cart: contractPath('GET', '/orders/cart'),
    cartItems: contractPath('POST', '/orders/cart/items'),
    cartItem: (listingId) =>
      contractPath('DELETE', '/orders/cart/items/{listingId}', { listingId }),
    checkout: contractPath('POST', '/orders/checkout'),
    checkouts: contractPath('GET', '/orders/checkouts'),
    checkoutById: (checkoutId) =>
      contractPath('GET', '/orders/checkouts/{checkoutId}', { checkoutId }),
    orders: contractPath('GET', '/orders/orders'),
    order: (orderId) => contractPath('GET', '/orders/orders/{orderId}', { orderId }),
    orderHistory: (orderId) => contractPath('GET', '/orders/orders/{orderId}/history', { orderId }),
    receipt: (orderId) => contractPath('GET', '/orders/orders/{orderId}/receipt', { orderId }),
    cancelOrder: (orderId) => contractPath('POST', '/orders/orders/{orderId}/cancel', { orderId }),
    transitionOrder: (orderId) =>
      contractPath('POST', '/orders/orders/{orderId}/transitions', { orderId }),
  },

  logistics: {
    providers: contractPath('GET', '/logistics/providers'),
    nearbyProviders: contractPath('GET', '/logistics/providers/nearby'),
    services: contractPath('GET', '/logistics/services'),
    shipments: contractPath('GET', '/logistics/shipments'),
    shipment: (shipmentId) =>
      contractPath('GET', '/logistics/shipments/{shipmentId}', { shipmentId }),
    shipmentHistory: (shipmentId) =>
      contractPath('GET', '/logistics/shipments/{shipmentId}/history', {
        shipmentId,
      }),
    shipmentTracking: (shipmentId) =>
      contractPath('GET', '/logistics/shipments/{shipmentId}/tracking', {
        shipmentId,
      }),
    shipmentPickup: (shipmentId) =>
      contractPath('POST', '/logistics/shipments/{shipmentId}/pickup', {
        shipmentId,
      }),
    shipmentStatus: (shipmentId) =>
      contractPath('POST', '/logistics/shipments/{shipmentId}/status', {
        shipmentId,
      }),
    shipmentAssignment: (shipmentId) =>
      contractPath('POST', '/logistics/shipments/{shipmentId}/assignment', {
        shipmentId,
      }),
    deliveries: contractPath('GET', '/logistics/deliveries'),
    delivery: (deliveryId) =>
      contractPath('GET', '/logistics/deliveries/{deliveryId}', { deliveryId }),
    deliveryProof: (deliveryId) =>
      contractPath('POST', '/logistics/deliveries/{deliveryId}/proof', {
        deliveryId,
      }),
    deliveryConfirm: (deliveryId) =>
      contractPath('POST', '/logistics/deliveries/{deliveryId}/confirm', {
        deliveryId,
      }),
    deliveryFailure: (deliveryId) =>
      contractPath('POST', '/logistics/deliveries/{deliveryId}/failure', {
        deliveryId,
      }),
  },

  intelligence: {
    capabilities: contractPath('GET', '/intelligence/ai/capabilities'),
    ask: contractPath('POST', '/intelligence/ai/ask'),
    retrieve: contractPath('POST', '/intelligence/ai/retrieve'),
    recommendations: contractPath('POST', '/intelligence/ai/recommendations'),
    feedback: contractPath('POST', '/intelligence/ai/feedback'),
    chat: contractPath('POST', '/intelligence/ai/chat'),
    conversations: contractPath('GET', '/intelligence/ai/conversations'),
    conversation: (conversationId) =>
      contractPath('GET', '/intelligence/ai/conversations/{conversationId}', {
        conversationId,
      }),
    imageCapabilities: contractPath('GET', '/intelligence/ai/image-analysis/capabilities'),
    analyzeImage: contractPath('POST', '/intelligence/ai/image-analysis/analyze'),
    multimodalAssets: contractPath('POST', '/intelligence/ai/multimodal/assets'),
    marketForecast: contractPath('POST', '/intelligence/ai/market/forecast'),
    marketExplain: contractPath('POST', '/intelligence/ai/market/explain'),
    weatherAdvisory: contractPath('POST', '/intelligence/ai/weather/advisory'),
  },

  notifications: {
    list: contractPath('GET', '/notifications'),
    info: contractPath('GET', '/notifications/info'),
    readAll: contractPath('POST', '/notifications/read-all'),
    deviceTokens: contractPath('POST', '/notifications/device-tokens'),
    revokeDeviceToken: contractPath('POST', '/notifications/device-tokens/revoke'),
    failures: contractPath('GET', '/notifications/admin/failures'),
    retry: (notificationId) =>
      contractPath('POST', '/notifications/admin/{notificationId}/retry', {
        notificationId,
      }),
    delivery: (notificationId) =>
      contractPath('GET', '/notifications/{notificationId}/delivery', {
        notificationId,
      }),
    read: (notificationId) =>
      contractPath('PATCH', '/notifications/{notificationId}/read', {
        notificationId,
      }),
  },
};
