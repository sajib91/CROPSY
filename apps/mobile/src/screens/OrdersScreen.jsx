import { useState } from 'react';
import { Alert, View } from 'react-native';

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
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function statusTone(status) {
  const value = String(status || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED', 'PAID'].includes(value)) return 'success';
  if (['CANCELLED', 'FAILED'].includes(value)) return 'danger';
  if (['PENDING', 'PROCESSING'].includes(value)) return 'warning';
  return 'info';
}

export default function OrdersScreen({ navigation }) {
  const { api, t, env } = useApp();
  const [expanded, setExpanded] = useState(null);

  const resource = useResource('orders', () => api.get(endpoints.orders.orders), {
    ttlMs: env.cacheTtlMs,
  });
  const orders = Array.isArray(resource.data) ? resource.data : resource.data?.orders || [];

  const cancel = async (orderId) => {
    Alert.alert(t('orders.cancelOrder'), t('orders.confirmCancel'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(endpoints.orders.cancelOrder(orderId));
            await resource.refresh();
          } catch {
            // Refresh below restores backend-authoritative state.
          }
        },
      },
    ]);
  };

  return (
    <Screen
      header={<ScreenHeader title={t('orders.title')} />}
      refreshing={resource.refreshing}
      onRefresh={resource.refresh}
    >
      {resource.error?.isNetworkError ? (
        <Notice tone="warning">{t('common.offline')}</Notice>
      ) : null}
      {resource.error ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {resource.loading && orders.length === 0 ? (
        <LoadingState label={t('common.loading')} />
      ) : null}
      {orders.length === 0 && !resource.loading ? (
        <EmptyState title={t('orders.noOrders')} />
      ) : null}

      {orders.map((order, index) => {
        const id = order.id || order.orderId;
        const items = Array.isArray(order.items) ? order.items : [];
        const isExpanded = expanded === id;
        return (
          <Card key={id || index} className="mb-3">
            <Badge tone={statusTone(order.status)}>{order.status || '—'}</Badge>
            <Row
              label={t('orders.orderNumber')}
              value={order.orderNumber || order.reference || id}
            />
            <Row label={t('common.date')} value={order.placedAt} />
            <Row
              label={t('orders.totalAmount')}
              value={`${order.totalAmount ?? 0} ${order.currency || ''}`}
              last={!isExpanded}
            />
            {isExpanded ? (
              <View className="mt-2 border-t border-slate-800 pt-2">
                {items.map((item, itemIndex) => (
                  <Row
                    key={item.id || itemIndex}
                    label={item.listingId || item.productId || `#${itemIndex + 1}`}
                    value={`${item.quantity ?? '—'} × ${item.unitPrice ?? '—'} = ${item.lineTotal ?? '—'}`}
                    last={itemIndex === items.length - 1}
                  />
                ))}
              </View>
            ) : null}
            <View className="mt-4 flex-row gap-2">
              <View className="flex-1">
                <Button
                  title={isExpanded ? t('common.close') : t('common.details')}
                  variant="secondary"
                  onPress={() => setExpanded(isExpanded ? null : id)}
                />
              </View>
              <View className="flex-1">
                <Button
                  title={t('orders.trackDelivery')}
                  onPress={() => navigation.navigate('Delivery', { orderId: id })}
                />
              </View>
            </View>
            {['PENDING', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CONFIRMED', 'PROCESSING'].includes(
              order.status,
            ) ? (
              <View className="mt-2">
                <Button
                  title={t('orders.cancelOrder')}
                  variant="danger"
                  onPress={() => cancel(id)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
