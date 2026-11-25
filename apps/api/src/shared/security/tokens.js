const { createHmac, hash, randomBytes, randomInt, timingSafeEqual } = require('node:crypto');

const { UnauthorizedError } = require('../kernel/errors');

const ACCESS_TOKEN_TYPE = 'access';
const PURPOSE_TOKEN_TYPES = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PHONE_VERIFICATION: 'phone_verification',
  PASSWORD_RESET: 'password_reset',
  LOGIN: 'login',
  ACCOUNT_RECOVERY: 'account_recovery',
});

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function secureEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

function createAccessToken({
  secret,
  userId,
  sessionId,
  sessionTokenHash,
  csrfToken,
  ttlSeconds,
  rolesVersion = 1,
  organizationId = null,
}) {
  if (!secret || !userId || !sessionId || !csrfToken) {
    throw new TypeError('createAccessToken requires a secret, user, session, and CSRF token.');
  }
  if (organizationId !== null && typeof organizationId !== 'string') {
    throw new TypeError('Access token organizationId must be a string or null.');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({
    typ: ACCESS_TOKEN_TYPE,
    sub: userId,
    sid: sessionId,
    sth: sessionTokenHash,
    csrf: csrfToken,
    rv: rolesVersion,
    org: organizationId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    jti: randomBytes(12).toString('base64url'),
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

function createPurposeToken({ secret, purpose, userId, otpId, ttlSeconds, destination }) {
  const tokenType = PURPOSE_TOKEN_TYPES[purpose];
  if (!tokenType) throw new TypeError(`Unsupported purpose token '${purpose}'.`);
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({
    typ: tokenType,
    sub: userId || null,
    otp: otpId,
    dest: destination || null,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    jti: randomBytes(12).toString('base64url'),
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

function verifySignedToken(token, secret, expectedType) {
  if (typeof token !== 'string') {
    throw new UnauthorizedError({ message: 'A valid token is required.' });
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError({ message: 'Malformed token.' });
  }

  const [headerText, payloadText, signature] = parts;
  const expectedSignature = sign(`${headerText}.${payloadText}`, secret);
  if (!secureEqual(signature, expectedSignature)) {
    throw new UnauthorizedError({ message: 'Invalid token signature.' });
  }

  let header;
  let payload;
  try {
    header = decodeJson(headerText);
    payload = decodeJson(payloadText);
  } catch {
    throw new UnauthorizedError({ message: 'Malformed token payload.' });
  }

  if (header.alg !== 'HS256' || payload.typ !== expectedType) {
    throw new UnauthorizedError({ message: 'Unexpected token type.' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    throw new UnauthorizedError({ message: 'Token has expired.' });
  }
  if (!Number.isFinite(payload.iat) || payload.iat > now + 60) {
    throw new UnauthorizedError({ message: 'Invalid token issue time.' });
  }

  return payload;
}

function verifyAccessToken(token, secret) {
  return verifySignedToken(token, secret, ACCESS_TOKEN_TYPE);
}

function verifyPurposeToken(token, secret, purpose) {
  const expectedType = PURPOSE_TOKEN_TYPES[purpose];
  if (!expectedType) throw new TypeError(`Unsupported purpose token '${purpose}'.`);
  return verifySignedToken(token, secret, expectedType);
}

function createOpaqueToken(byteLength = 48) {
  return randomBytes(byteLength).toString('base64url');
}

function hashToken(token) {
  return hash('sha256', token).toString('hex');
}

function createOtpCode(length) {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

module.exports = {
  ACCESS_TOKEN_TYPE,
  PURPOSE_TOKEN_TYPES,
  createAccessToken,
  createPurposeToken,
  createOpaqueToken,
  createOtpCode,
  hashToken,
  secureEqual,
  verifyAccessToken,
  verifyPurposeToken,
};
