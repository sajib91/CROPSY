import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@cropsy:cache:v1:';

export function makeCacheKey(...parts) {
  return `${CACHE_PREFIX}${parts.filter(Boolean).join(':')}`;
}

/**
 * Read a cached payload. Expired entries are treated as a miss and removed.
 * Cached data is a read fallback only: it is never used to make business
 * decisions or to authorize actions.
 */
export async function readCache(key, { maxAgeMs } = {}) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== 'object' || !('value' in entry)) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const age = Date.now() - Number(entry.storedAt || 0);
    if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && age > maxAgeMs) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return entry.value;
  } catch {
    return null;
  }
}

export async function writeCache(key, value, { ttlMs } = {}) {
  try {
    const entry = {
      storedAt: Date.now(),
      ...(Number.isFinite(ttlMs) && ttlMs > 0 ? { ttlMs } : {}),
      value,
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache write failures must never break an online request.
  }
}

export async function removeCache(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

export async function clearAppCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cached = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (cached.length > 0) await AsyncStorage.multiRemove(cached);
  } catch {
    // Ignore unavailable storage.
  }
}
