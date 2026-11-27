import { useCallback } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Badge,
  Card,
  ClickableRow,
  EmptyState,
  LoadingState,
  Notice,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatCard,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function greetingName(profile, session) {
  return (
    profile?.firstName ||
    profile?.profile?.firstName ||
    session?.user?.firstName ||
    session?.user?.email ||
    'there'
  );
}

function hasRole(session, profile, code) {
  const roles = session?.roles || profile?.roles || profile?.roleCodes || [];
  return roles.some((role) => String(role?.code || role).toUpperCase() === code);
}

export default function DashboardScreen({ navigation }) {
  const { api, t, session, profile, unreadCount, env } = useApp();

  const farms = useResource('farms', () => api.get(endpoints.farmers.farms), {
    ttlMs: env.cacheTtlMs,
  });
  const cultivations = useResource(
    'cultivations',
    () => api.get(endpoints.agriculture.cultivations),
    {
      ttlMs: env.cacheTtlMs,
    },
  );
  const orders = useResource('orders', () => api.get(endpoints.orders.orders), {
    ttlMs: env.cacheTtlMs,
  });

  const farmList = Array.isArray(farms.data) ? farms.data : farms.data?.farms || [];
  const cultivationList = Array.isArray(cultivations.data)
    ? cultivations.data
    : cultivations.data?.cultivations || [];
  const orderList = Array.isArray(orders.data) ? orders.data : orders.data?.orders || [];
  const isFarmer = hasRole(session, profile, 'FARMER');
  const pendingOrders = orderList.filter((order) =>
    ['PENDING', 'PROCESSING', 'CONFIRMED'].includes(String(order.status || '').toUpperCase()),
  ).length;

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([farms.refresh(), cultivations.refresh(), orders.refresh()]);
  }, [farms.refresh, cultivations.refresh, orders.refresh]);

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('dashboard.greeting', { name: greetingName(profile, session) })}
          subtitle={isFarmer ? t('dashboard.farmerSubtitle') : t('dashboard.subtitle')}
          right={
            <Badge tone="info">
              {t('dashboard.roleLabel', { role: (session?.roles || [])[0] || 'CROPSY' })}
            </Badge>
          }
        />
      }
      refreshing={farms.refreshing || cultivations.refreshing || orders.refreshing}
      onRefresh={refreshAll}
    >
      {farms.error?.isNetworkError ||
      cultivations.error?.isNetworkError ||
      orders.error?.isNetworkError ? (
        <Notice tone="warning">{t('common.offline')}</Notice>
      ) : null}

      <SectionHeader title={t('dashboard.stats')} />
      <View className="flex-row gap-3">
        <StatCard label={t('dashboard.myFarms')} value={farmList.length} />
        <StatCard
          label={t('dashboard.activeCultivations')}
          value={
            cultivationList.filter((item) => item.status === 'ACTIVE').length ||
            cultivationList.length
          }
        />
      </View>
      <View className="mt-3 flex-row gap-3">
        <StatCard label={t('dashboard.pendingOrders')} value={pendingOrders} />
        <StatCard label={t('dashboard.unreadNotifications')} value={unreadCount} />
      </View>

      <SectionHeader title={t('dashboard.quickActions')} />
      <Card>
        <ClickableRow
          title={t('dashboard.myFarms')}
          subtitle={isFarmer ? t('farms.noFarms') : undefined}
          onPress={() => navigation.navigate('Farms')}
        />
        <ClickableRow title={t('dashboard.myCrops')} onPress={() => navigation.navigate('Crops')} />
        <ClickableRow
          title={t('dashboard.marketplace')}
          onPress={() => navigation.navigate('Marketplace')}
        />
        <ClickableRow title={t('dashboard.orders')} onPress={() => navigation.navigate('Orders')} />
        <ClickableRow
          title={t('dashboard.assistant')}
          onPress={() => navigation.navigate('Assistant')}
        />
        <ClickableRow
          title={t('dashboard.notifications')}
          onPress={() => navigation.navigate('Notifications')}
          last
        />
      </Card>

      <SectionHeader title={t('dashboard.recentActivity')} />
      {cultivations.loading && cultivationList.length === 0 ? (
        <LoadingState label={t('common.loading')} />
      ) : null}
      {cultivationList.length === 0 && !cultivations.loading ? (
        <EmptyState title={t('dashboard.noActivity')} />
      ) : null}
      {cultivationList.slice(0, 5).map((item, index) => (
        <Card key={item.id || index} className="mb-2">
          <Badge tone="success">{item.status || 'ACTIVE'}</Badge>
          <View className="mt-2">
            <ClickableRow
              title={item.cropName || item.name || t('crops.title')}
              subtitle={item.farmName || item.createdAt}
              onPress={() => navigation.navigate('Crops')}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
