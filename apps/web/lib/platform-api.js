import { contractPath, requireApiOperation } from '@cropsy/api-contracts';

import { getWebEnv } from './env';

const { NEXT_PUBLIC_API_URL } = getWebEnv();
const TIMEOUT_MS = 5000;

async function fetchPublic(path) {
  requireApiOperation('GET', path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${NEXT_PUBLIC_API_URL}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const body = await response.json();
    if (!body?.success) {
      const message =
        typeof body?.error === 'string' ? body.error : 'API response was unsuccessful';
      return { ok: false, error: message };
    }

    return { ok: true, data: body.data, meta: body.meta };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${TIMEOUT_MS / 1000}s` };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown API error' };
  } finally {
    clearTimeout(timeout);
  }
}

export function getApiHealth() {
  return fetchPublic('/health');
}

export function getApiVersion() {
  return fetchPublic('/version');
}

export function getPublicModules() {
  return fetchPublic('/modules');
}

export function getModuleInfo(moduleId) {
  return fetchPublic(contractPath('GET', '/{moduleId}/info', { moduleId }));
}
