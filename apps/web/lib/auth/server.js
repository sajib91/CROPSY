import { NextResponse } from 'next/server';
import { requireApiOperation } from '@cropsy/api-contracts';

import { getWebEnv } from '../env';

const { NEXT_PUBLIC_API_URL } = getWebEnv();
const API_PROXY_URL = process.env.CROPSY_API_PROXY_URL?.trim()
  ? process.env.CROPSY_API_PROXY_URL.trim().replace(/\/$/, '')
  : NEXT_PUBLIC_API_URL;

try {
  const parsed = new URL(API_PROXY_URL);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
} catch {
  throw new Error('CROPSY_API_PROXY_URL must be a valid HTTP(S) URL.');
}

const TIMEOUT_MS = 10000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SENSITIVE_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'csrfToken',
  'csrf',
  'sessionToken',
  'resetToken',
  'loginToken',
  'recoveryToken',
  'token',
  'passwordHash',
  'password_hash',
  'passwordDigest',
  'password_digest',
  'sessionTokenHash',
  'session_token_hash',
  'refreshTokenHash',
  'refresh_token_hash',
  'resetTokenHash',
  'reset_token_hash',
  'loginTokenHash',
  'login_token_hash',
  'recoveryTokenHash',
  'recovery_token_hash',
  'nationalIdHash',
  'national_id_hash',
  'codeHash',
  'code_hash',
  'secret',
  'apiKey',
  'api_key',
]);
const FORWARDED_HEADERS = new Set([
  'accept',
  'content-type',
  'cookie',
  'user-agent',
  'x-forwarded-for',
  'x-organization-id',
  'x-request-id',
]);
const PURPOSE_TTL_SECONDS = 900;

const PURPOSE_COOKIE_NAMES = Object.freeze({
  reset: 'cropsy_purpose_reset',
  login: 'cropsy_purpose_login',
  recovery: 'cropsy_purpose_recovery',
});

const PURPOSE_TOKEN_FIELDS = Object.freeze({
  resetToken: 'reset',
  loginToken: 'login',
  recoveryToken: 'recovery',
});

function configuredCookieName(key, fallback) {
  const value = process.env[key]?.trim();
  return value || fallback;
}

export const authCookieNames = Object.freeze({
  access: configuredCookieName('AUTH_COOKIE_ACCESS_NAME', 'cropsy_access'),
  refresh: configuredCookieName('AUTH_COOKIE_REFRESH_NAME', 'cropsy_refresh'),
  purpose: PURPOSE_COOKIE_NAMES,
});

export function parseCookies(headerValue) {
  const cookies = {};
  if (typeof headerValue !== 'string' || headerValue.length === 0) return cookies;

  for (const part of headerValue.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

function requestCookies(request) {
  return parseCookies(request.headers.get('cookie'));
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function readJwtClaim(token, claim) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload?.[claim] === 'string' ? payload[claim] : null;
  } catch {
    return null;
  }
}

export function csrfFromRequest(request) {
  return readJwtClaim(requestCookies(request)[authCookieNames.access], 'csrf');
}

export function hasAuthCookie(request, kind) {
  return Boolean(requestCookies(request)[authCookieNames[kind]]);
}

export function hasPurposeCookie(request, kind) {
  return Boolean(requestCookies(request)[PURPOSE_COOKIE_NAMES[kind]]);
}

export function getPurposeToken(request, kind) {
  return requestCookies(request)[PURPOSE_COOKIE_NAMES[kind]] || null;
}

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    result[key] = stripSensitive(child);
  }
  return result;
}

function parseSetCookie(header) {
  const [pair, ...attributeParts] = header.split(';');
  const separator = pair.indexOf('=');
  if (separator < 0) return null;

  const attributes = {};
  for (const part of attributeParts) {
    const index = part.indexOf('=');
    const name = (index < 0 ? part : part.slice(0, index)).trim().toLowerCase();
    const value = index < 0 ? '' : part.slice(index + 1).trim();
    attributes[name] = value;
  }

  const maxAge = Number.parseInt(attributes['max-age'] ?? '', 10);
  return {
    name: pair.slice(0, separator).trim(),
    value: pair.slice(separator + 1).trim(),
    maxAge: Number.isFinite(maxAge) ? Math.max(0, maxAge) : undefined,
    secure: Object.prototype.hasOwnProperty.call(attributes, 'secure'),
    httpOnly: Object.prototype.hasOwnProperty.call(attributes, 'httponly'),
    sameSite: attributes.samesite || 'Lax',
    path: attributes.path || '/',
  };
}

function usesHttps(request) {
  const forwarded = request.headers.get('x-forwarded-proto') || '';
  return (
    forwarded.split(',')[0].trim().toLowerCase() === 'https' ||
    request.nextUrl.protocol === 'https:'
  );
}

export function serializeCookie({
  name,
  value,
  maxAge,
  httpOnly = true,
  sameSite = 'Lax',
  secure = false,
  path = '/',
}) {
  if (!/^[\w-]+$/.test(name)) throw new TypeError('Invalid cookie name.');
  if (typeof value !== 'string' || /[\r\n;]/.test(value)) {
    throw new TypeError('Invalid cookie value.');
  }

  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (maxAge !== undefined) segments.push(`Max-Age=${Math.max(0, maxAge)}`);
  segments.push(`Path=${path}`);
  if (secure) segments.push('Secure');
  if (httpOnly) segments.push('HttpOnly');
  segments.push(`SameSite=${sameSite}`);
  return segments.join('; ');
}

function rewriteSetCookie(header, request) {
  const parsed = parseSetCookie(header);
  if (!parsed) return null;

  return serializeCookie({
    ...parsed,
    httpOnly: true,
    secure: parsed.secure || usesHttps(request),
    sameSite: parsed.sameSite,
  });
}

export function appendCookie(response, options) {
  response.headers.append('set-cookie', serializeCookie(options));
  return response;
}

export function clearCookie(response, name, request) {
  return appendCookie(response, {
    name,
    value: '',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    secure: usesHttps(request),
  });
}

export function clearAuthCookies(response, request) {
  for (const name of [
    authCookieNames.access,
    authCookieNames.refresh,
    ...Object.values(PURPOSE_COOKIE_NAMES),
  ]) {
    clearCookie(response, name, request);
  }
  return response;
}

function upstreamSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function buildHeaders(request) {
  const headers = new Headers({ accept: 'application/json' });

  for (const [key, value] of request.headers.entries()) {
    if (FORWARDED_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }

  const csrf = csrfFromRequest(request);
  if (csrf && !SAFE_METHODS.has(request.method)) headers.set('x-csrf-token', csrf);

  return headers;
}

export async function proxyApiRequest(
  request,
  { path, search = '', injectBody, setPurposeCookies = true },
) {
  // The proxy never forwards a path the backend no longer publishes. This is
  // the last web-side boundary before the canonical API route is invoked.
  requireApiOperation(request.method, path);
  const url = `${API_PROXY_URL}${path}${search}`;
  const headers = buildHeaders(request);
  let body;

  if (!SAFE_METHODS.has(request.method)) {
    const rawBody = await request.text();

    if (injectBody) {
      let parsed = {};
      if (rawBody) {
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = {};
        }
      }
      body = JSON.stringify({ ...parsed, ...injectBody(parsed) });
      headers.set('content-type', 'application/json');
    } else {
      body = rawBody || undefined;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return NextResponse.json(
      {
        success: false,
        error: 'infrastructure_error',
        meta: {
          message:
            error?.name === 'AbortError'
              ? 'The API request timed out.'
              : 'The API could not be reached.',
        },
      },
      { status: 502 },
    );
  }
  clearTimeout(timeout);

  const text = await upstream.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  const response =
    typeof payload === 'string'
      ? new NextResponse(text, { status: upstream.status })
      : NextResponse.json(stripSensitive(payload), { status: upstream.status });

  for (const header of upstreamSetCookies(upstream)) {
    const rewritten = rewriteSetCookie(header, request);
    if (rewritten) response.headers.append('set-cookie', rewritten);
  }

  const succeeded = upstream.ok && payload?.success === true;
  if (succeeded && setPurposeCookies) {
    for (const [field, kind] of Object.entries(PURPOSE_TOKEN_FIELDS)) {
      const token = payload?.data?.[field];
      if (typeof token === 'string' && token.length > 0) {
        appendCookie(response, {
          name: PURPOSE_COOKIE_NAMES[kind],
          value: token,
          maxAge: PURPOSE_TTL_SECONDS,
          httpOnly: true,
          sameSite: 'Strict',
          secure: usesHttps(request),
        });
      }
    }
  }

  return response;
}
