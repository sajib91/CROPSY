const DEFAULT_API_URL = 'http://localhost:4000/api/v1';
const SUPPORTED_LANGUAGES = ['en', 'bn'];

function validateUrl(value, label) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }

  return value.replace(/\/$/, '');
}

function socketUrlFromApiUrl(apiUrl) {
  const parsed = new URL(apiUrl);
  const apiPrefixIndex = parsed.pathname.indexOf('/api/');
  const pathname = apiPrefixIndex >= 0 ? parsed.pathname.slice(0, apiPrefixIndex) : '';
  return `${parsed.protocol}//${parsed.host}${pathname}`.replace(/\/$/, '');
}

function booleanFlag(value, defaultValue = true) {
  if (value === undefined || value === '') return defaultValue;
  return value !== 'false' && value !== '0';
}

export function getMobileEnv(source = process.env) {
  const apiUrl = validateUrl(source.EXPO_PUBLIC_API_URL || DEFAULT_API_URL, 'EXPO_PUBLIC_API_URL');
  const language = SUPPORTED_LANGUAGES.includes(source.EXPO_PUBLIC_DEFAULT_LANGUAGE)
    ? source.EXPO_PUBLIC_DEFAULT_LANGUAGE
    : 'en';

  return {
    apiUrl,
    socketUrl: validateUrl(
      source.EXPO_PUBLIC_SOCKET_URL || socketUrlFromApiUrl(apiUrl),
      'EXPO_PUBLIC_SOCKET_URL',
    ),
    realtimeEnabled: booleanFlag(source.EXPO_PUBLIC_REALTIME_ENABLED, true),
    pushEnabled: booleanFlag(source.EXPO_PUBLIC_PUSH_ENABLED, true),
    language,
    cacheTtlMs:
      Number(source.EXPO_PUBLIC_CACHE_TTL_MS) > 0
        ? Number(source.EXPO_PUBLIC_CACHE_TTL_MS)
        : 10 * 60 * 1000,
  };
}
