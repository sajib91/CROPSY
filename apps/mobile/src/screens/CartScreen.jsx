import { useState } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function newReferenceKey() {
  const random = Math.random().toString(36).slice(2, 10);
  return `mobile-${Date.now()}-${random}`;
}

export default function CartScreen({ navigation }) {
  const { api, t } = useApp();
  const [referenceKey, setReferenceKey] = useState(newReferenceKey);
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const resource = useResource('cart', () => api.get(endpoints.orders.cart));
  const cart = resource.data && !Array.isArray(resource.data) ? resource.data : null;
  const items = cart?.items || [];

  const checkoutNow = async () => {
    setBusy(true);
    setError(null);
    try {
      // The backend recreates every amount from current listing prices.
      const result = await api.post(endpoints.orders.checkout, {
        referenceKey: referenceKey.trim(),
      });
      setCheckout(result);
      await resource.refresh();
    } catch (checkoutError) {
      setError(checkoutError);
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (listingId) => {
    setError(null);
    try {
      await api.delete(endpoints.orders.cartItem(listingId));
      await resource.refresh();
    } catch (removeError) {
      setError(removeError);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title={t('cart.title')} />}
      refreshing={resource.refreshing}
      onRefresh={resource.refresh}
    >
      {resource.loading ? <LoadingState label={t('common.loading')} /> : null}
      {resource.error || error ? (
        <ErrorState
          message={(resource.error || error).message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {items.length === 0 && !resource.loading ? <EmptyState title={t('cart.empty')} /> : null}

      {items.map((item, index) => (
        <Card key={item.listingId || item.id || index} className="mb-3">
          <Row label={t('marketplace.product')} value={item.listing?.title || item.listingId} />
          <Row label={t('common.quantity')} value={item.quantity} />
          <Row
            label={t('common.price')}
            value={`${item.unitPriceSnapshot ?? '—'} ${item.currency || ''}`}
          />
          <Row
            label={t('cart.lineTotal')}
            value={Number(item.unitPriceSnapshot || 0) * Number(item.quantity || 0)}
            last
          />
          <View className="mt-3">
            <Button
              title={t('cart.remove')}
              variant="danger"
              onPress={() => removeItem(item.listingId)}
            />
          </View>
        </Card>
      ))}

      {items.length > 0 ? (
        <Card className="mt-4">
          <Row label={t('cart.subtotal')} value={cart?.subtotalAmount ?? 0} last />
          <TextField
            label={t('cart.referenceKey')}
            value={referenceKey}
            onChangeText={setReferenceKey}
            helper={t('cart.referenceKeyHint')}
            autoCapitalize="none"
          />
          <Button title={t('cart.checkout')} loading={busy} onPress={checkoutNow} />
        </Card>
      ) : null}

      {checkout ? (
        <Card className="mt-4">
          <Notice>{t('common.created')}</Notice>
          <Row label={t('cart.referenceKey')} value={checkout.referenceKey} />
          <Row label={t('orders.totalAmount')} value={checkout.totalAmount} />
          <Row label={t('orders.title')} value={checkout.orders?.length || 0} last />
          <View className="mt-4">
            <Button
              title={t('orders.title')}
              variant="secondary"
              onPress={() => navigation.navigate('Orders')}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
