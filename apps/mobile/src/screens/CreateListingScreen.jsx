import { useState } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import {
  Button,
  Card,
  ErrorState,
  Notice,
  OptionPicker,
  Screen,
  ScreenHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const LISTING_STATUSES = ['DRAFT', 'ACTIVE', 'RESERVED', 'INACTIVE'];

const EMPTY = {
  title: '',
  productId: '',
  status: 'ACTIVE',
  description: '',
  unitPrice: '',
  currency: 'BDT',
  quantityAvailable: '',
  minOrderQuantity: '1',
  qualityGradeId: '',
  harvestDate: '',
  availableLocation: '',
  imageUrl: '',
  imageAltText: '',
};

function asArray(data, key) {
  return Array.isArray(data) ? data : data?.[key] || [];
}

export default function CreateListingScreen({ navigation }) {
  const { api, t, language } = useApp();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const products = useResource('catalog:products', () => api.get(endpoints.catalog.products));
  const grades = useResource('catalog:grades', () => api.get(endpoints.catalog.qualityGrades));

  const update = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async () => {
    if (!form.availableLocation.trim() && !form.harvestDate.trim()) {
      setError(new Error(t('marketplace.locationOrHarvestRequired')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        productId: form.productId.trim(),
        status: form.status,
        title: form.title.trim(),
        unitPrice: Number(form.unitPrice),
        currency: form.currency.trim().toUpperCase(),
        quantityAvailable: Number(form.quantityAvailable),
        minOrderQuantity: Number(form.minOrderQuantity) || 1,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.qualityGradeId.trim()) payload.qualityGradeId = form.qualityGradeId.trim();
      if (form.harvestDate.trim()) payload.harvestDate = form.harvestDate.trim();
      if (form.availableLocation.trim()) payload.availableLocation = form.availableLocation.trim();
      if (form.imageUrl.trim()) {
        payload.images = [
          {
            url: form.imageUrl.trim(),
            ...(form.imageAltText.trim() ? { altText: form.imageAltText.trim() } : {}),
            sortOrder: 0,
          },
        ];
      }

      const result = await api.post(endpoints.marketplace.listings, payload);
      const listingId = result?.id || result?.listing?.id;
      navigation.navigate('ListingDetail', { listingId });
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  };

  const productList = asArray(products.data, 'products');
  const gradeList = asArray(grades.data, 'qualityGrades');

  return (
    <Screen header={<ScreenHeader title={t('marketplace.createListing')} />}>
      <Card>
        <TextField
          label={t('marketplace.listingTitle')}
          value={form.title}
          onChangeText={update('title')}
        />
        <OptionPicker
          label={t('marketplace.product')}
          options={productList.map((product) => ({
            value: product.id,
            label: (language === 'bn' && product.nameBn) || product.name || product.sku,
          }))}
          value={form.productId}
          onChange={update('productId')}
          placeholder={t('marketplace.noProducts')}
        />
        <TextField
          label={t('marketplace.productId')}
          value={form.productId}
          onChangeText={update('productId')}
          helper={t('marketplace.productIdHint')}
          autoCapitalize="none"
        />
        <OptionPicker
          label={t('common.status')}
          options={LISTING_STATUSES.map((status) => ({ value: status, label: status }))}
          value={form.status}
          onChange={update('status')}
        />
        <TextField
          label={t('common.price')}
          value={form.unitPrice}
          onChangeText={update('unitPrice')}
          keyboardType="decimal-pad"
        />
        <TextField
          label={t('marketplace.currency')}
          value={form.currency}
          onChangeText={update('currency')}
          autoCapitalize="characters"
        />
        <TextField
          label={t('marketplace.stock')}
          value={form.quantityAvailable}
          onChangeText={update('quantityAvailable')}
          keyboardType="numeric"
        />
        <TextField
          label={t('marketplace.minOrderQuantity')}
          value={form.minOrderQuantity}
          onChangeText={update('minOrderQuantity')}
          keyboardType="numeric"
        />
        <OptionPicker
          label={t('marketplace.qualityGrade')}
          options={gradeList.map((grade) => ({
            value: grade.id,
            label: (language === 'bn' && grade.nameBn) || grade.name || grade.code,
          }))}
          value={form.qualityGradeId}
          onChange={update('qualityGradeId')}
          placeholder={t('common.none')}
        />
        <TextField
          label={t('marketplace.availableLocation')}
          value={form.availableLocation}
          onChangeText={update('availableLocation')}
        />
        <TextField
          label={t('marketplace.harvestDate')}
          value={form.harvestDate}
          onChangeText={update('harvestDate')}
          placeholder="YYYY-MM-DD"
        />
        <TextField
          label={t('common.description')}
          value={form.description}
          onChangeText={update('description')}
          multiline
        />
        <TextField
          label={t('marketplace.imageUrl')}
          value={form.imageUrl}
          onChangeText={update('imageUrl')}
          autoCapitalize="none"
          helper={t('marketplace.imageHostingHint')}
        />
        <TextField
          label={t('marketplace.imageAltText')}
          value={form.imageAltText}
          onChangeText={update('imageAltText')}
        />
        <Notice>{t('marketplace.locationOrHarvestRequired')}</Notice>
        {error ? <ErrorState message={error.message || t('common.errorTitle')} /> : null}
        <View className="mt-4">
          <Button title={t('marketplace.publish')} loading={busy} onPress={submit} />
        </View>
      </Card>
    </Screen>
  );
}
