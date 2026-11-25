const { ValidationError } = require('../kernel/errors');

const SUPPORTED_API_VERSIONS = Object.freeze(['v1']);

function resolveApiVersion(prefix) {
  if (typeof prefix !== 'string' || !prefix.startsWith('/')) {
    throw new ValidationError({
      message: 'API_PREFIX must be an absolute path',
      details: { prefix },
    });
  }

  const normalized = prefix.length > 1 ? prefix.replace(/\/+$/, '') : prefix;
  const match = /\/(v\d+)$/.exec(normalized);
  const version = match ? match[1] : null;

  if (!version || !SUPPORTED_API_VERSIONS.includes(version)) {
    throw new ValidationError({
      message: `Unsupported API version in API_PREFIX '${prefix}'`,
      details: { supportedVersions: SUPPORTED_API_VERSIONS },
    });
  }

  return Object.freeze({
    version,
    prefix: normalized,
    supportedVersions: SUPPORTED_API_VERSIONS,
  });
}

function assertRequestedVersion(headerValue, activeVersion) {
  if (headerValue === undefined) return activeVersion;

  const requested = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (requested !== activeVersion) {
    throw new ValidationError({
      message: `Requested API version '${requested}' is not available`,
      details: { requested, activeVersion, supportedVersions: SUPPORTED_API_VERSIONS },
    });
  }

  return requested;
}

module.exports = { SUPPORTED_API_VERSIONS, resolveApiVersion, assertRequestedVersion };
