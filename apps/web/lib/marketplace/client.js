import {
  dashboardDelete,
  dashboardGet,
  dashboardPatch,
  dashboardPost,
} from '@/lib/dashboard/client';

// Every function below reads or writes through the same-origin authenticated
// proxy. The browser never calculates or submits authoritative prices, stock,
// discounts, fees, taxes, or totals.
export function listListings(params) {
  return dashboardGet('/marketplace/listings', params);
}

export function getListing(listingId) {
  return dashboardGet(`/marketplace/listings/${listingId}`);
}

export function getSeller(sellerId) {
  return dashboardGet(`/marketplace/sellers/${sellerId}`);
}

export async function listCategories(params) {
  const data = await dashboardGet('/catalog/categories', params);
  return data?.categories ?? [];
}

export async function listProducts(params) {
  const data = await dashboardGet('/catalog/products', params);
  return data?.products ?? [];
}

export function getProduct(productId) {
  return dashboardGet(`/catalog/products/${productId}`);
}

export async function listQualityGrades(params) {
  const data = await dashboardGet('/catalog/quality-grades', params);
  return data?.qualityGrades ?? [];
}

export function getCart(params) {
  return dashboardGet('/orders/cart', params);
}

export function addCartItem(body) {
  return dashboardPost('/orders/cart/items', body);
}

export function updateCartItem(listingId, body) {
  return dashboardPatch(`/orders/cart/items/${listingId}`, body);
}

export function removeCartItem(listingId) {
  return dashboardDelete(`/orders/cart/items/${listingId}`);
}

export function createCheckout(body) {
  return dashboardPost('/orders/checkout', body);
}

export async function listOrders(params) {
  const data = await dashboardGet('/orders/orders', params);
  return data?.orders ?? [];
}

export function getOrder(orderId) {
  return dashboardGet(`/orders/orders/${orderId}`);
}

export async function getOrderHistory(orderId) {
  const data = await dashboardGet(`/orders/orders/${orderId}/history`);
  return data?.history ?? [];
}

export function cancelOrder(orderId, body) {
  return dashboardPost(`/orders/orders/${orderId}/cancel`, body);
}

export function listShipments(params) {
  return dashboardGet('/logistics/shipments', params);
}

export function getShipmentTracking(shipmentId) {
  return dashboardGet(`/logistics/shipments/${shipmentId}/tracking`);
}

export function createListing(body) {
  return dashboardPost('/marketplace/listings', body);
}

export function updateListing(listingId, body) {
  return dashboardPatch(`/marketplace/listings/${listingId}`, body);
}

export function deactivateListing(listingId) {
  return dashboardPost(`/marketplace/listings/${listingId}/deactivate`, {});
}

export function addListingImage(listingId, body) {
  return dashboardPost(`/marketplace/listings/${listingId}/images`, body);
}

export function removeListingImage(listingId, imageId) {
  return dashboardDelete(`/marketplace/listings/${listingId}/images/${imageId}`);
}
