import {
  apiErrorEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  contractPath,
  refreshResponseSchema,
  requireApiOperation,
} from '@cropsy/api-contracts';

import { clearSession, readSession, updateSessionTokens } from '../auth/session';

export const MOBILE_CLIENT = 'mobile';

export class ApiError extends Error {
  constructor({ message, status = 0, code = 'unknown', details, meta } = {}) {
    super(message || 'The request could not be completed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.meta = meta;
  }

  get isNetworkError() {
    return this.status === 0 && this.code === 'network_error';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

function buildUrl(baseUrl, path, query) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${normalizedPath}`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(key, String(entry));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function errorFromBody(body, status) {
  const parsed = apiErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    const errorValue = body.error;
    const errorObject = typeof errorValue === 'object' && errorValue !== null ? errorValue : {};
    return new ApiError({
      status,
      code: typeof errorValue === 'string' ? errorValue : errorObject.code || 'api_error',
      message: body.meta?.message || errorObject.message || 'The request was rejected.',
      details: errorObject.details,
      meta: body.meta,
    });
  }

  return new ApiError({
    status,
    code: 'http_error',
    message: `Request failed with status ${status}.`,
  });
}

export function createApiClient({
  baseUrl,
  getSession = readSession,
  setTokens = updateSessionTokens,
  onUnauthorized,
  fetchImpl,
  timeoutMs = 20000,
} = {}) {
  if (!baseUrl) throw new TypeError('createApiClient requires a base URL.');
  const doFetch = fetchImpl || globalThis.fetch;
  let refreshPromise = null;

  async function refreshTokens() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const session = await getSession();
        if (!session?.refreshToken) throw new Error('No refresh token is available.');

        const response = await doFetch(
          buildUrl(baseUrl, contractPath('POST', '/iam/auth/refresh')),
          {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              refreshToken: session.refreshToken,
              client: MOBILE_CLIENT,
            }),
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error('The session could not be refreshed.');

        const parsed = refreshResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error('Refresh response did not match the API contract.');

        await setTokens({
          accessToken: parsed.data.data.accessToken,
          refreshToken: parsed.data.data.refreshToken,
        });
        return parsed.data.data.accessToken;
      })().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function send(path, options, retry = true) {
    const {
      method = 'GET',
      body,
      query,
      auth = true,
      headers = {},
      timeoutMs: requestTimeout = timeoutMs,
      signal,
    } = options || {};

    // Resolve against the generated contract before building the URL so stale
    // mobile paths cannot silently diverge from the backend route registry.
    requireApiOperation(method, path);

    const session = auth ? await getSession() : null;
    const requestHeaders = {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(auth && session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...headers,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort);

    let response;
    try {
      response = await doFetch(buildUrl(baseUrl, path, query), {
        method,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'CROPSY could not reach the server. Check your connection and try again.',
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Some endpoints return no body; treat it as empty data.
    }

    if (response.status === 401 && auth && retry) {
      try {
        await refreshTokens();
        return send(path, options, false);
      } catch {
        await clearSession();
        onUnauthorized?.();
        throw new ApiError({
          status: 401,
          code: 'session_expired',
          message: 'Your session has expired. Please sign in again.',
        });
      }
    }

    if (!response.ok) {
      throw errorFromBody(payload, response.status);
    }

    if (payload === null || payload === undefined || payload === '') {
      return { data: null, meta: undefined };
    }

    const parsed = apiSuccessEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      // A successful HTTP response with a non-standard body is still returned
      // to the caller; validation failures in typed helpers are surfaced there.
      if (payload?.success === true) return { data: payload.data, meta: payload.meta };
      throw new ApiError({
        status: response.status,
        code: 'invalid_response',
        message: 'The server response did not match the expected format.',
      });
    }

    return { data: parsed.data.data, meta: parsed.data.meta };
  }

  async function request(path, options) {
    const result = await send(path, options);
    return result.data;
  }

  return {
    request,
    requestWithMeta: send,
    refreshTokens,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  };
}
