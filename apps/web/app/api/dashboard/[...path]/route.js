import { NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const VALID_SEGMENT = /^[A-Za-z0-9_-]+$/;
const ID = '[A-Za-z0-9_-]+';
const MODULES = new Set([
  'farmers',
  'agriculture',
  'catalog',
  'marketplace',
  'orders',
  'market-intelligence',
  'intelligence',
  'notifications',
  'logistics',
  'warehouse',
  'quality',
  'organizations',
  'traceability',
  'payments',
  'iam',
]);

// New modules are deliberately narrower than the original farmer proxy set.
// The API still enforces permissions; this allowlist prevents accidental
// exposure of unrelated routes from the same upstream modules.
const RESTRICTED_READ_ROUTES = {
  logistics: new RegExp(
    `^logistics/(?:providers(?:/nearby|/${ID})?|services|shipments(?:/${ID}(?:/(?:tracking|history))?)?|deliveries(?:/${ID})?|audits|dashboard/(?:buyer|seller|provider))$`,
  ),
  warehouse: new RegExp(
    `^warehouse/(?:warehouses(?:/${ID}(?:/capacity)?)?|inventories(?:/${ID})?|reservations(?:/${ID})?|movements|alerts|locations|conditions|reconciliations|report|staff)$`,
  ),
  quality: new RegExp(`^quality/(?:inspections(?:/${ID}(?:/evidence)?)?|audits)$`),
  organizations: new RegExp(
    `^organizations(?:/(?:types|${ID}(?:/(?:members|invitations|addresses|documents)(?:/${ID})?)?))?$`,
  ),
  iam: new RegExp(
    `^iam/auth/(?:me|organizations|users/${ID}|roles|permissions|matrix|audit|access/check)$`,
  ),
  traceability: new RegExp(`^traceability/(?:batches(?:/${ID}(?:/timeline)?)?|audits)$`),
  payments: new RegExp(`^payments/(?:providers|payments(?:/${ID}(?:/history)?)?|refunds)$`),
};

const POST_ROUTES = [
  /^intelligence\/ai\/(ask|recommendations|chat|feedback|conversations|multimodal\/assets|image-analysis\/(analyze|feedback)|weather\/(observations|forecasts|alerts|advisory))$/,
  new RegExp(
    `^marketplace/(?:favorites/${ID}|listings|listings/${ID}/(?:deactivate|locations|images|reports|messages))$`,
  ),
  new RegExp(`^orders/(?:cart/items|checkout|orders/${ID}/(?:cancel|transitions))$`),
  new RegExp(
    `^logistics/(?:providers|services|shipments|shipments/${ID}/(?:pickup|assignment|status)|deliveries/${ID}/(?:proof|failure|confirm))$`,
  ),
  new RegExp(
    `^warehouse/(?:warehouses|inventories|receipts|locations|conditions|reconciliations|alerts/${ID}/(?:acknowledge|resolve))$`,
  ),
  new RegExp(`^quality/(?:inspections|inspections/${ID}/(?:evidence|grade|verify|reject))$`),
  new RegExp(`^organizations/${ID}/invitations$`),
];

// Marketplace write paths needed by buyer and seller flows. The API remains the
// authority for ownership, tenant scope, permissions, price, and stock.
const PATCH_ROUTES = [
  new RegExp(`^marketplace/listings/${ID}$`),
  new RegExp(`^orders/cart/items/${ID}$`),
];

const DELETE_ROUTES = [
  new RegExp(`^marketplace/favorites/${ID}$`),
  new RegExp(`^marketplace/listings/${ID}/(?:locations|images)/${ID}$`),
  new RegExp(`^orders/cart/items/${ID}$`),
];

function reject(status, error) {
  return NextResponse.json({ success: false, error }, { status });
}

async function handle(request, { params }) {
  const { path: segments } = await params;
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.length > 8 ||
    !segments.every((segment) => VALID_SEGMENT.test(segment))
  ) {
    return reject(404, 'not_found');
  }

  const key = segments.join('/');
  const moduleId = segments[0];
  if (!MODULES.has(moduleId)) return reject(404, 'not_found');

  const restrictedRead = RESTRICTED_READ_ROUTES[moduleId];
  if (request.method === 'GET' && restrictedRead && !restrictedRead.test(key)) {
    return reject(404, 'not_found');
  }

  const method = request.method;
  if (method === 'POST' && !POST_ROUTES.some((pattern) => pattern.test(key))) {
    return reject(405, 'method_not_allowed');
  }
  if (method === 'PATCH' && !PATCH_ROUTES.some((pattern) => pattern.test(key))) {
    return reject(405, 'method_not_allowed');
  }
  if (method === 'DELETE' && !DELETE_ROUTES.some((pattern) => pattern.test(key))) {
    return reject(405, 'method_not_allowed');
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    return reject(405, 'method_not_allowed');
  }

  return proxyApiRequest(request, {
    path: `/${key}`,
    search: new URL(request.url).search,
    setPurposeCookies: false,
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
