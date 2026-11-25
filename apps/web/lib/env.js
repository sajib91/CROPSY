const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export function getWebEnv(source = process.env) {
  const value = source.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must use http or https');
  }

  return { NEXT_PUBLIC_API_URL: value.replace(/\/$/, '') };
}
