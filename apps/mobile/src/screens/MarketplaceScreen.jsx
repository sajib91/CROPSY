import { useState } from 'react';
import { View } from 'react-native';

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
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function listingsFrom(data) {
  return Array.isArray(data) ? data : data?.listings || [];
}

export default function MarketplaceScreen({ navigation }) {
  const { api, t } = useApp();
  const [search, setSearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [location, setLocation] = useState('');
  const [applied, setApplied] = useState({ search: '', categoryCode: '', location: '' });
  const [favoriteError, setFavoriteError] = useState(null);

  const resource = useResource(
    ['listings', applied.search, applied.categoryCode, applied.location],
    () =>
      api.get(endpoints.marketplace.listings, {
        query: {
          ...(applied.search ? { search: applied.search } : {}),
          ...(applied.categoryCode ? { categoryCode: applied.categoryCode } : {}),
          ...(applied.location ? { location: applied.location } : {}),
        },
      }),
    { deps: [applied.search, applied.categoryCode, applied.location] },
  );

  const listings = listingsFrom(resource.data);

  const favorite = async (listingId) => {
    setFavoriteError(null);
    try {
      await api.post(endpoints.marketplace.favorite(listingId));
    } catch (error) {
      setFavoriteError(error);
    }
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('marketplace.title')}
          right={
            <Button
              title={t('marketplace.createListing')}
              fullWidth={false}
              onPress={() => navigation.navigate('CreateListing')}
            />
          }
        />
      }
      refreshing={resource.refreshing}
      onRefresh={resource.refresh}
    >
      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder={t('marketplace.searchPlaceholder')}
      />
      <TextField
        value={categoryCode}
        onChangeText={setCategoryCode}
        placeholder={t('marketplace.filterCategory')}
        autoCapitalize="characters"
      />
      <TextField
        value={location}
        onChangeText={setLocation}
        placeholder={t('marketplace.locationFilter')}
      />
      <View className="mb-4">
        <Button
          title={t('common.search')}
          variant="secondary"
          onPress={() =>
            setApplied({
              search: search.trim(),
              categoryCode: categoryCode.trim(),
              location: location.trim(),
            })
          }
        />
      </View>

      {resource.error?.isNetworkError ? (
        <Notice tone="warning">{t('common.offline')}</Notice>
      ) : null}
      {resource.error && !resource.fromCache ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {favoriteError ? <ErrorState message={favoriteError.message} /> : null}
      {resource.loading && listings.length === 0 ? (
        <LoadingState label={t('common.loading')} />
      ) : null}
      {listings.length === 0 && !resource.loading ? (
        <EmptyState title={t('marketplace.noListings')} />
      ) : null}

      {listings.map((listing, index) => (
        <Card
          key={listing.id || index}
          className="mb-3"
          onPress={() => navigation.navigate('ListingDetail', { listingId: listing.id })}
        >
          <Badge tone={listing.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {listing.status || '—'}
          </Badge>
          <Row label={t('common.name')} value={listing.title} />
          <Row label={t('marketplace.seller')} value={listing.seller?.displayName} />
          <Row
            label={t('common.price')}
            value={`${listing.unitPrice ?? '—'} ${listing.currency || ''}`}
          />
          <Row label={t('common.quantity')} value={listing.quantityAvailable} />
          <Row label={t('common.location')} value={listing.availableLocation} last />
          <View className="mt-3">
            <Button
              title={t('marketplace.favoriteAdded')}
              variant="secondary"
              onPress={() => favorite(listing.id)}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
