const DEFAULT_API_URL = 'http://localhost:4000/api/v1';
const DEFAULT_SITE_URL = 'http://localhost:3000';

function parseHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }
  return parsed;
}

export function getWebEnv(source = process.env) {
  const apiUrl = source.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  const siteUrl = source.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  const supportEmail = source.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()
    ? source.NEXT_PUBLIC_SUPPORT_EMAIL.trim()
    : null;

  const parsedApi = parseHttpUrl(apiUrl, 'NEXT_PUBLIC_API_URL');
  const parsedSite = parseHttpUrl(siteUrl, 'NEXT_PUBLIC_SITE_URL');

  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new Error('NEXT_PUBLIC_SUPPORT_EMAIL must be a valid email address');
  }

  return {
    NEXT_PUBLIC_API_URL: apiUrl.replace(/\/$/, ''),
    NEXT_PUBLIC_SITE_URL: parsedSite.origin,
    NEXT_PUBLIC_SUPPORT_EMAIL: supportEmail,
    API_HOST: parsedApi.host,
  };
}
