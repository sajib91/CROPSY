import { requireApiOperation } from '@cropsy/api-contracts';

import { refreshSession } from '../auth/client';

const DASHBOARD_BASE = '/api/dashboard';

export class DashboardError extends Error {
  constructor({ message, code, status, details }) {
    super(message || 'The dashboard request could not be completed.');
    this.name = 'DashboardError';
    this.code = code || 'request_failed';
    this.status = status || 0;
    this.details = details || {};
  }
}

export function dashboardQuery(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

function toDashboardError(response, payload) {
  return new DashboardError({
    message: payload?.meta?.message || 'The dashboard request could not be completed.',
    code: payload?.error || 'request_failed',
    status: response.status,
    details: payload?.meta?.details || {},
  });
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  // Every browser request is checked against the canonical OpenAPI operation
  // inventory before it reaches the same-origin proxy. A removed or renamed
  // backend route therefore fails immediately instead of drifting silently.
  requireApiOperation(method, path);
  const response = await fetch(`${DASHBOARD_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseBody(response);
  if (!response.ok) {
    const error = toDashboardError(response, payload);
    if (retry && response.status === 401) {
      try {
        await refreshSession();
        return await request(path, { method, body, retry: false });
      } catch {
        // Keep the original authorization error.
      }
    }
    throw error;
  }

  return payload?.data ?? null;
}

export function dashboardGet(path, params) {
  return request(dashboardQuery(path, params));
}

export function dashboardPost(path, body) {
  return request(path, { method: 'POST', body, retry: false });
}

export function dashboardPatch(path, body) {
  return request(path, { method: 'PATCH', body, retry: false });
}

export function dashboardDelete(path) {
  return request(path, { method: 'DELETE', retry: false });
}
