function parseCookies(headerValue) {
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

function requestUsesHttps(request) {
  const forwarded = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded || request.protocol;
  return String(protocol || '').toLowerCase() === 'https';
}

function resolveSecure(env, request) {
  if (env.AUTH_COOKIE_SECURE === 'true') return true;
  if (env.AUTH_COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production' || requestUsesHttps(request);
}

function serializeCookie(name, value, attributes = {}) {
  if (!/^[\w-]+$/.test(name)) throw new TypeError('Invalid cookie name.');
  if (typeof value !== 'string' || /[\r\n;]/.test(value)) {
    throw new TypeError('Invalid cookie value.');
  }

  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (attributes.maxAge !== undefined) segments.push(`Max-Age=${Math.max(0, attributes.maxAge)}`);
  if (attributes.path) segments.push(`Path=${attributes.path}`);
  if (attributes.domain) segments.push(`Domain=${attributes.domain}`);
  if (attributes.secure) segments.push('Secure');
  if (attributes.httpOnly) segments.push('HttpOnly');
  if (attributes.sameSite) segments.push(`SameSite=${attributes.sameSite}`);
  return segments.join('; ');
}

function cookieAttributes(env, request, maxAge) {
  const secure = resolveSecure(env, request) || env.AUTH_COOKIE_SAMESITE === 'none';
  return {
    maxAge,
    path: '/',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
    secure,
    httpOnly: true,
    sameSite: env.AUTH_COOKIE_SAMESITE === 'none' ? 'None' : capitalize(env.AUTH_COOKIE_SAMESITE),
  };
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setAuthCookies(reply, tokens, env, request) {
  const accessMaxAge = env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
  const refreshMaxAge = env.AUTH_REFRESH_TOKEN_TTL_SECONDS;
  reply.header('Set-Cookie', [
    serializeCookie(
      env.AUTH_COOKIE_ACCESS_NAME,
      tokens.accessToken,
      cookieAttributes(env, request, accessMaxAge),
    ),
    serializeCookie(
      env.AUTH_COOKIE_REFRESH_NAME,
      tokens.refreshToken,
      cookieAttributes(env, request, refreshMaxAge),
    ),
  ]);
}

function clearAuthCookies(reply, env, request) {
  const attributes = {
    ...cookieAttributes(env, request, 0),
    httpOnly: true,
  };
  reply.header('Set-Cookie', [
    serializeCookie(env.AUTH_COOKIE_ACCESS_NAME, '', attributes),
    serializeCookie(env.AUTH_COOKIE_REFRESH_NAME, '', attributes),
  ]);
}

module.exports = {
  capitalize,
  clearAuthCookies,
  cookieAttributes,
  parseCookies,
  requestUsesHttps,
  resolveSecure,
  serializeCookie,
  setAuthCookies,
};
