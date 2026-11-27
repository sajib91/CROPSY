import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'cropsy-default';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function requestPushPermissions() {
  if (Platform.OS === 'web') return Notifications.PermissionStatus.GRANTED;

  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.status === Notifications.PermissionStatus.GRANTED || current.granted === true;
  if (granted) return current;

  return Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: false,
    },
  });
}

async function createAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'CROPSY updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#10b981',
  });
}

export async function getPushToken() {
  if (Platform.OS === 'web') return null;
  await createAndroidChannel();

  const permission = await requestPushPermissions();
  const granted =
    permission.status === Notifications.PermissionStatus.GRANTED || permission.granted === true;
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (projectId) {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
      return { token: expoToken.data, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' };
    } catch {
      // Fall back to the native token when Expo push is not configured.
    }
  }

  try {
    const nativeToken = await Notifications.getDevicePushTokenAsync();
    return { token: String(nativeToken.data), platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' };
  } catch {
    return null;
  }
}

export function addNotificationListener(listener) {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    listener?.({
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data || {},
    });
  });
  return () => subscription.remove();
}

export function addNotificationResponseListener(listener) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    listener?.(response.notification.request.content.data || {});
  });
  return () => subscription.remove();
}
