import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'cropsy.session.v1';
const DEVICE_TOKEN_KEY = '@cropsy:device-token:v1';
const DEVICE_ID_KEY = '@cropsy:device-id:v1';

let secureStoreAvailable;

async function canUseSecureStore() {
  if (secureStoreAvailable !== undefined) return secureStoreAvailable;
  try {
    secureStoreAvailable = Boolean(await SecureStore.isAvailableAsync());
  } catch {
    secureStoreAvailable = false;
  }
  return secureStoreAvailable;
}

async function readSecret(key) {
  if (await canUseSecureStore()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // Fall through to the platform key/value store.
    }
  }
  return AsyncStorage.getItem(key);
}

async function writeSecret(key, value) {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // Fall through to the platform key/value store.
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function deleteSecret(key) {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Fall through to the platform key/value store.
    }
  }
  await AsyncStorage.removeItem(key);
}

export async function readSession() {
  try {
    const raw = await readSecret(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  const normalized = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    client: session.client || 'mobile',
    user: session.user || null,
    organizationId: session.organizationId || null,
    roles: Array.isArray(session.roles) ? session.roles : [],
    savedAt: new Date().toISOString(),
  };
  await writeSecret(SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function updateSessionTokens({ accessToken, refreshToken }) {
  const existing = await readSession();
  if (!existing) return null;
  return saveSession({
    ...existing,
    accessToken: accessToken || existing.accessToken,
    refreshToken: refreshToken || existing.refreshToken,
  });
}

export async function clearSession() {
  await deleteSecret(SESSION_KEY);
}

export async function readDeviceToken() {
  try {
    return await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveDeviceToken(token) {
  try {
    if (token) await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
    else await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export async function getDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = `cropsy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return `cropsy-${Date.now().toString(36)}`;
  }
}
