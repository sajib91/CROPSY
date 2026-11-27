import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function formatDate(value, language) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function statusTone(status) {
  if (status === 'READ' || status === 'DELIVERED' || status === 'SENT') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
}

export default function NotificationsScreen() {
  const {
    api,
    t,
    language,
    notifications,
    notificationError,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    unreadCount,
    env,
  } = useApp();
  const [selected, setSelected] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [actionError, setActionError] = useState(null);

  const resource = useResource(
    'notifications',
    async () => {
      const data = await loadNotifications();
      return data;
    },
    { deps: [] },
  );

  const openDelivery = useCallback(
    async (id) => {
      setActionError(null);
      setDelivery(null);
      try {
        setDelivery(await api.get(endpoints.notifications.delivery(id)));
      } catch (error) {
        setActionError(error);
      }
    },
    [api],
  );

  const onMarkRead = async (id) => {
    setActionError(null);
    await markNotificationRead(id);
  };

  const onMarkAll = async () => {
    setActionError(null);
    await markAllNotificationsRead();
  };

  const items = notifications.length > 0 ? notifications : resource.data || [];
  const visibleError = notificationError || resource.error || actionError;

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('notifications.title')}
          subtitle={unreadCount ? t('notifications.unread', { count: unreadCount }) : undefined}
          right={
            <Pressable onPress={onMarkAll} accessibilityRole="button" disabled={unreadCount === 0}>
              <Text className="text-sm font-medium text-emerald-400">
                {t('notifications.markAllRead')}
              </Text>
            </Pressable>
          }
        />
      }
      refreshing={resource.refreshing}
      onRefresh={loadNotifications}
    >
      {!env.realtimeEnabled ? (
        <Notice tone="warning">
          {t('settings.realtimeStatus')}: {t('settings.disabled')}
        </Notice>
      ) : null}
      {resource.loading && items.length === 0 ? <LoadingState label={t('common.loading')} /> : null}
      {visibleError ? (
        <ErrorState
          message={visibleError.message || t('common.errorTitle')}
          onRetry={loadNotifications}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {items.length === 0 && !resource.loading ? (
        <EmptyState title={t('notifications.empty')} />
      ) : null}

      {items.map((item) => (
        <Card key={item.id} className="mb-3">
          <Pressable onPress={() => setSelected(selected === item.id ? null : item.id)}>
            <View className="flex-row items-start justify-between">
              <View className="mr-3 flex-1">
                <Text className="text-base font-semibold text-white">{item.title}</Text>
                <Text className="mt-1 text-sm leading-5 text-slate-300">{item.body}</Text>
              </View>
              <Badge tone={statusTone(item.status)}>{item.status || item.channel}</Badge>
            </View>
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-xs text-slate-500">
                {t('notifications.receivedAt', { date: formatDate(item.createdAt, language) })}
              </Text>
              <Text className="text-xs font-medium text-emerald-400">
                {selected === item.id ? t('common.close') : t('common.details')}
              </Text>
            </View>
          </Pressable>

          {selected === item.id ? (
            <View className="mt-4 border-t border-slate-800 pt-3">
              <Row label={t('common.type')} value={item.type} />
              <Row label={t('notifications.channels')} value={item.channel} />
              <Row label={t('common.status')} value={item.status} />
              <Row
                label={t('common.date')}
                value={formatDate(item.readAt || item.createdAt, language)}
              />
              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <Button
                    title={t('notifications.deliveryStatus')}
                    variant="secondary"
                    onPress={() => openDelivery(item.id)}
                  />
                </View>
                {!item.readAt ? (
                  <View className="flex-1">
                    <Button
                      title={t('notifications.markRead')}
                      onPress={() => onMarkRead(item.id)}
                    />
                  </View>
                ) : null}
              </View>
              {delivery ? (
                <View className="mt-3 rounded-xl bg-slate-950 p-3">
                  <Text className="text-xs font-semibold text-slate-300">
                    {t('notifications.attempts')}: {delivery.attempts?.length ?? 0}
                  </Text>
                  {Array.isArray(delivery.attempts)
                    ? delivery.attempts.map((attempt, index) => (
                        <Text
                          key={`${attempt.id || index}`}
                          className="mt-2 text-xs text-slate-400"
                        >
                          {attempt.channel || '—'} · {attempt.state || '—'} ·{' '}
                          {attempt.error || attempt.occurredAt || ''}
                        </Text>
                      ))
                    : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>
      ))}

      <SectionHeader title={t('notifications.preferences')} />
      <NotificationPreferences />
    </Screen>
  );
}

function NotificationPreferences() {
  const { api, t } = useApp();
  const [preferences, setPreferences] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useResource(
    'notification-preferences',
    async () => {
      const data = await api.get(endpoints.users.preferences);
      const values = Array.isArray(data) ? data : data?.preferences || [];
      setPreferences(values);
      return values;
    },
    { deps: [] },
  );

  const toggle = (index) => {
    setPreferences((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, enabled: !item.enabled } : item,
      ),
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = preferences.map(({ channel, eventType, enabled }) => ({
        channel,
        eventType,
        enabled: Boolean(enabled),
      }));
      await api.put(endpoints.users.preferences, payload);
      setMessage(t('common.saved'));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {preferences.length === 0 ? (
        <Text className="text-sm text-slate-400">{t('common.noData')}</Text>
      ) : null}
      {preferences.map((item, index) => (
        <Pressable
          key={`${item.channel}:${item.eventType}`}
          onPress={() => toggle(index)}
          className="flex-row items-center justify-between border-b border-slate-800 py-3"
        >
          <View className="mr-3 flex-1">
            <Text className="text-sm text-white">{item.eventType || item.type}</Text>
            <Text className="mt-1 text-xs text-slate-400">{item.channel}</Text>
          </View>
          <Badge tone={item.enabled ? 'success' : 'neutral'}>
            {item.enabled ? t('settings.enabled') : t('settings.disabled')}
          </Badge>
        </Pressable>
      ))}
      {message ? <Notice>{message}</Notice> : null}
      {error ? <ErrorState message={error.message || t('common.errorTitle')} /> : null}
      {preferences.length > 0 ? (
        <View className="mt-4">
          <Button title={t('notifications.savePreferences')} loading={saving} onPress={save} />
        </View>
      ) : null}
    </Card>
  );
}
