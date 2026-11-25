import { getMobileEnv } from '../config/env';

export async function checkApiHealth(options = {}) {
  const { apiUrl } = getMobileEnv(options.env);

  const response = await fetch(`${apiUrl}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}`);
  }

  const body = await response.json();
  if (body?.success !== true || typeof body?.data?.status !== 'string') {
    throw new Error('API health response did not match the expected shape');
  }

  return body;
}
