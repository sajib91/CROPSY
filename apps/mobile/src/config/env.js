const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

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

export function getMobileEnv(source = process.env) {
  return {
    apiUrl: validateUrl(source.EXPO_PUBLIC_API_URL || DEFAULT_API_URL, 'EXPO_PUBLIC_API_URL'),
  };
}
