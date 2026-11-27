import { useState } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

export default function ListingDetailScreen({ route, navigation }) {
  const { api, t } = useApp();
  const listingId = route?.params?.listingId;
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const resource = useResource(
    ['listing', listingId],
    () => api.get(endpoints.marketplace.listing(listingId)),
    { enabled: Boolean(listingId) },
  );
  const listing = resource.data?.listing || resource.data || {};
  const images = Array.isArray(listing.images) ? listing.images : [];

  const addToCart = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(endpoints.orders.cartItems, {
        listingId: listing.id || listingId,
        quantity: Number(quantity) || 1,
      });
      navigation.navigate('Cart');
    } catch (cartError) {
      setError(cartError);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(endpoints.marketplace.listingMessages(listing.id || listingId), {
        body: message.trim(),
      });
      setMessage('');
    } catch (messageError) {
      setError(messageError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title={listing.title || t('marketplace.listingDetails')} />}
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

      <Card>
        <Badge tone={listing.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {listing.status || '—'}
        </Badge>
        <Row
          label={t('common.price')}
          value={`${listing.unitPrice ?? '—'} ${listing.currency || ''}`}
        />
        <Row label={t('common.quantity')} value={listing.quantityAvailable ?? '—'} />
        <Row label={t('marketplace.minOrderQuantity')} value={listing.minOrderQuantity ?? '—'} />
        <Row label={t('marketplace.qualityGrade')} value={listing.qualityGrade?.name} />
        <Row label={t('marketplace.seller')} value={listing.seller?.displayName} />
        <Row label={t('common.location')} value={listing.availableLocation} />
        <Row label={t('marketplace.harvestDate')} value={listing.harvestDate} />
        <Row label={t('marketplace.images')} value={images.length} />
        <Row label={t('common.description')} value={listing.description} last />
      </Card>

      <Card className="mt-4">
        <TextField
          label={t('common.quantity')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
        />
        <Button title={t('marketplace.addToCart')} loading={busy} onPress={addToCart} />
      </Card>

      <Card className="mt-4">
        <TextField
          label={t('marketplace.messages')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('marketplace.messagePlaceholder')}
          multiline
        />
        <View className="mt-2">
          <Button title={t('common.send')} loading={busy} onPress={sendMessage} />
        </View>
      </Card>
    </Screen>
  );
}
