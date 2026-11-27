import { notificationListResponseSchema } from '@cropsy/api-contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getMobileEnv } from '../config/env';
import { createApiClient } from '../lib/api/client';
import { endpoints } from '../lib/api/endpoints';
import {
  clearSession,
  getDeviceId,
  readSession,
  saveDeviceToken,
  saveSession,
} from '../lib/auth/session';
import { getDictionary, normalizeLanguage, translate } from '../lib/i18n';
import { navigate } from '../navigation/navigationRef';
import { SCREEN_NAMES } from '../navigation/screenNames';
import { createRealtimeClient } from '../lib/notifications/realtime';
import {
  addNotificationListener,
  addNotificationResponseListener,
  configureNotificationHandler,
  getPushToken,
} from '../lib/notifications/push';

const LANGUAGE_KEY = '@cropsy:language:v1';

const AppContext = createContext(null);

function normalizeNotification(value) {
  return {
    id: value.id,
    type: value.type,
    title: value.title,
    body: value.body,
    channel: value.channel,
    status: value.status,
    data: value.data || {},
    createdAt: value.createdAt,
    readAt: value.readAt || null,
  };
}

export function AppProvider({ children }) {
  const env = useMemo(() => getMobileEnv(), []);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState(env.language);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState(null);

  const sessionRef = useRef(null);
  sessionRef.current = session;
  const realtimeRef = useRef(null);
  const unauthorizedRef = useRef(() => {});

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: env.apiUrl,
        onUnauthorized: () => unauthorizedRef.current(),
      }),
    [env.apiUrl],
  );

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const signOut = useCallback(async () => {
    const deviceToken = sessionRef.current?.deviceToken;
    if (deviceToken) {
      try {
        await api.post(endpoints.notifications.revokeDeviceToken, { token: deviceToken });
      } catch {
        // Revocation is best effort; local session cleanup still proceeds.
      }
    }
    await clearSession();
    await saveDeviceToken(null);
    realtimeRef.current?.disconnect();
    realtimeRef.current = null;
    setSession(null);
    setProfile(null);
    setNotifications([]);
  }, [api]);

  unauthorizedRef.current = signOut;

  const refreshProfile = useCallback(async () => {
    if (!sessionRef.current?.accessToken) return null;
    const data = await api.get(endpoints.users.me);
    setProfile(data);
    return data;
  }, [api]);

  const loadNotifications = useCallback(async () => {
    if (!sessionRef.current?.accessToken) return [];
    try {
      const data = await api.get(endpoints.notifications.list, { query: { limit: 50 } });
      const parsed = notificationListResponseSchema.safeParse({ success: true, data });
      const records = parsed.success
        ? parsed.data.data.notifications
        : Array.isArray(data?.notifications)
          ? data.notifications
          : [];
      const normalized = records.map(normalizeNotification);
      setNotifications(normalized);
      setNotificationError(null);
      return normalized;
    } catch (error) {
      setNotificationError(error);
      return [];
    }
  }, [api]);

  const markNotificationRead = useCallback(
    async (id) => {
      try {
        const updated = await api.patch(endpoints.notifications.read(id));
        setNotifications((previous) =>
          previous.map((item) => (item.id === id ? normalizeNotification(updated) : item)),
        );
      } catch (error) {
        setNotificationError(error);
      }
    },
    [api],
  );

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await api.post(endpoints.notifications.readAll);
      setNotifications((previous) =>
        previous.map((item) => ({ ...item, readAt: new Date().toISOString(), status: 'READ' })),
      );
    } catch (error) {
      setNotificationError(error);
    }
  }, [api]);

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await readSession();
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY).catch(() => null);
      if (!active) return;
      if (storedLanguage) setLanguageState(normalizeLanguage(storedLanguage));
      if (stored?.accessToken) {
        setSession(stored);
        try {
          const data = await api.get(endpoints.users.me);
          if (active) {
            setProfile(data);
            const preferred = String(
              data?.preferredLanguage || data?.profile?.preferredLanguage || '',
            );
            if (preferred && !storedLanguage) setLanguageState(normalizeLanguage(preferred));
          }
        } catch {
          // Profile loading is retried by the dashboard; cached session remains valid.
        }
        await loadNotifications();
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [api, loadNotifications]);

  useEffect(() => {
    if (!session?.accessToken || !env.realtimeEnabled) return undefined;
    const client = createRealtimeClient({
      socketUrl: env.socketUrl,
      getToken: () => sessionRef.current?.accessToken,
      onNotification: (payload) => {
        if (!payload?.id) return;
        setNotifications((previous) =>
          [
            normalizeNotification(payload),
            ...previous.filter((item) => item.id !== payload.id),
          ].slice(0, 100),
        );
      },
    });
    realtimeRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      realtimeRef.current = null;
    };
  }, [session?.accessToken, env.realtimeEnabled, env.socketUrl]);

  useEffect(() => {
    if (!session?.accessToken || !env.pushEnabled || Platform.OS === 'web') return undefined;
    let active = true;
    (async () => {
      const push = await getPushToken();
      if (!push || !active) return;
      try {
        const deviceId = await getDeviceId();
        const registered = await api.post(endpoints.notifications.deviceTokens, {
          token: push.token,
          platform: push.platform,
          deviceId,
        });
        await saveDeviceToken(push.token);
        if (active) {
          setSession((previous) =>
            previous ? { ...previous, deviceToken: push.token } : previous,
          );
        }
        return registered;
      } catch {
        return null;
      }
    })();

    const removeReceived = addNotificationListener(() => {
      loadNotifications();
    });
    const removeResponse = addNotificationResponseListener((data) => {
      if (data?.notificationId) markNotificationRead(data.notificationId);
      navigate(SCREEN_NAMES.notifications);
    });
    return () => {
      active = false;
      removeReceived();
      removeResponse();
    };
  }, [session?.accessToken, env.pushEnabled, api, loadNotifications, markNotificationRead]);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setLanguageState(normalized);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, normalized);
    } catch {
      // Language still applies for this session.
    }
    return normalized;
  }, []);

  const signIn = useCallback(
    async (tokens) => {
      const stored = await saveSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        client: tokens.client || 'mobile',
        user: tokens.user,
        roles: tokens.roles,
        organizationId: tokens.organizationId,
      });
      setSession(stored);
      try {
        const data = await api.get(endpoints.users.me);
        setProfile(data);
        const preferred = String(data?.preferredLanguage || '');
        if (preferred) await setLanguage(normalizeLanguage(preferred));
      } catch {
        // The dashboard can retry profile loading.
      }
      await loadNotifications();
      return stored;
    },
    [api, loadNotifications, setLanguage],
  );

  const value = useMemo(
    () => ({
      api,
      env,
      session,
      profile,
      ready,
      language,
      dictionary: getDictionary(language),
      notifications,
      notificationError,
      unreadCount: notifications.filter((item) => !item.readAt).length,
      t,
      signIn,
      signOut,
      refreshProfile,
      loadNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      setLanguage,
      setProfile,
    }),
    [
      api,
      env,
      session,
      profile,
      ready,
      language,
      notifications,
      notificationError,
      t,
      signIn,
      signOut,
      refreshProfile,
      loadNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      setLanguage,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
