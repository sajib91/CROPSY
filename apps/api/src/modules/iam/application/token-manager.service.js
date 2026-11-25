const tokenSecurity = require('../../../shared/security/tokens');

class TokenManager {
  constructor({ secret, env }) {
    if (typeof secret !== 'string' || secret.length < 16) {
      throw new TypeError('TokenManager requires a sufficiently long signing secret.');
    }
    if (!env) throw new TypeError('TokenManager requires environment configuration.');
    this.secret = secret;
    this.env = env;
  }

  createAccessToken({ userId, sessionId, sessionTokenHash, csrfToken, rolesVersion = 1 }) {
    return tokenSecurity.createAccessToken({
      secret: this.secret,
      userId,
      sessionId,
      sessionTokenHash,
      csrfToken,
      ttlSeconds: this.env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      rolesVersion,
    });
  }

  createPurposeToken(purpose, { userId, otpId, destination }) {
    return tokenSecurity.createPurposeToken({
      secret: this.secret,
      purpose,
      userId,
      otpId,
      destination,
      ttlSeconds: this.env.AUTH_PURPOSE_TOKEN_TTL_SECONDS,
    });
  }

  verifyAccessToken(token) {
    return tokenSecurity.verifyAccessToken(token, this.secret);
  }

  verifyPurposeToken(token, purpose) {
    return tokenSecurity.verifyPurposeToken(token, this.secret, purpose);
  }

  createOpaqueToken(byteLength) {
    return tokenSecurity.createOpaqueToken(byteLength);
  }

  hashToken(token) {
    return tokenSecurity.hashToken(token);
  }
}

module.exports = { TokenManager };
