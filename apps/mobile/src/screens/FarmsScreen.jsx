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
  OptionPicker,
  Row,
  Screen,
  ScreenHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const AREA_UNITS = [
  { value: 'HECTARE', labelKey: 'farms.unit.hectare' },
  { value: 'ACRE', labelKey: 'farms.unit.acre' },
  { value: 'SQUARE_METER', labelKey: 'farms.unit.squareMeter' },
];

const EMPTY_FARM = {
  name: '',
  areaValue: '',
  areaUnit: 'HECTARE',
  addressLine: '',
  divisionId: '',
  districtId: '',
  upazilaId: '',
  unionId: '',
  latitude: '',
  longitude: '',
};

function asArray(data, key) {
  return Array.isArray(data) ? data : data?.[key] || [];
}

function geoOptions(items, language, t) {
  return items
    .map((item) => ({
      value: item.id,
      label: (language === 'bn' && item.nameBn) || item.name || item.code || item.id,
    }))
    .concat(items.length === 0 ? [{ value: '', label: t('farms.geoUnavailable') }] : []);
}

export default function FarmsScreen() {
  const { api, t, language, env } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FARM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const resource = useResource('farms', () => api.get(endpoints.farmers.farms), {
    ttlMs: env.cacheTtlMs,
  });

  const divisions = useResource('farm:divisions', () => api.get(endpoints.farmers.divisions));
  const districts = useResource(
    ['farm:districts', form.divisionId],
    () => api.get(endpoints.farmers.districts(form.divisionId)),
    { enabled: Boolean(form.divisionId), deps: [form.divisionId] },
  );
  const upazilas = useResource(
    ['farm:upazilas', form.districtId],
    () => api.get(endpoints.farmers.upazilas(form.districtId)),
    { enabled: Boolean(form.districtId), deps: [form.districtId] },
  );
  const unions = useResource(
    ['farm:unions', form.upazilaId],
    () => api.get(endpoints.farmers.unions(form.upazilaId)),
    { enabled: Boolean(form.upazilaId), deps: [form.upazilaId] },
  );

  const update = (field) => (value) => {
    setForm((previous) => {
      const next = { ...previous, [field]: value };
      if (field === 'divisionId') {
        next.districtId = '';
        next.upazilaId = '';
        next.unionId = '';
      }
      if (field === 'districtId') {
        next.upazilaId = '';
        next.unionId = '';
      }
      if (field === 'upazilaId') next.unionId = '';
      return next;
    });
  };

  const submit = async () => {
    const locationValues = [
      form.addressLine,
      form.divisionId,
      form.districtId,
      form.upazilaId,
      form.unionId,
      form.latitude,
      form.longitude,
    ];
    const hasLocation = locationValues.some((value) => String(value).trim());
    if (hasLocation && locationValues.some((value) => !String(value).trim())) {
      setError(new Error(t('farms.locationIncomplete')));
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        areaUnit: form.areaUnit,
        areaValue: Number(form.areaValue) || 0,
      };
      if (hasLocation) {
        payload.location = {
          addressLine: form.addressLine.trim(),
          divisionId: form.divisionId,
          districtId: form.districtId,
          upazilaId: form.upazilaId,
          unionId: form.unionId,
          // GeoJSON ordering is [longitude, latitude].
          point: [Number(form.longitude), Number(form.latitude)],
        };
      }
      await api.post(endpoints.farmers.farms, payload);
      setForm(EMPTY_FARM);
      setShowForm(false);
      await resource.refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const farms = asArray(resource.data, 'farms');

  return (
    <Screen
      header={
        <ScreenHeader
          title={t('farms.title')}
          right={
            <Button
              title={t('farms.addFarm')}
              onPress={() => setShowForm((previous) => !previous)}
              fullWidth={false}
            />
          }
        />
      }
      refreshing={resource.refreshing}
      onRefresh={resource.refresh}
    >
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

      {showForm ? (
        <Card className="mb-5">
          <TextField label={t('farms.farmName')} value={form.name} onChangeText={update('name')} />
          <OptionPicker
            label={t('farms.areaUnit')}
            options={AREA_UNITS.map((unit) => ({ value: unit.value, label: t(unit.labelKey) }))}
            value={form.areaUnit}
            onChange={update('areaUnit')}
          />
          <TextField
            label={t('farms.areaValue')}
            value={form.areaValue}
            onChangeText={update('areaValue')}
            keyboardType="decimal-pad"
          />
          <TextField
            label={t('farms.addressLine')}
            value={form.addressLine}
            onChangeText={update('addressLine')}
          />
          <OptionPicker
            label={t('farms.division')}
            options={geoOptions(asArray(divisions.data, 'divisions'), language, t)}
            value={form.divisionId}
            onChange={update('divisionId')}
          />
          <OptionPicker
            label={t('farms.district')}
            options={geoOptions(asArray(districts.data, 'districts'), language, t)}
            value={form.districtId}
            onChange={update('districtId')}
          />
          <OptionPicker
            label={t('farms.upazila')}
            options={geoOptions(asArray(upazilas.data, 'upazilas'), language, t)}
            value={form.upazilaId}
            onChange={update('upazilaId')}
          />
          <OptionPicker
            label={t('farms.union')}
            options={geoOptions(asArray(unions.data, 'unions'), language, t)}
            value={form.unionId}
            onChange={update('unionId')}
          />
          <TextField
            label={t('farms.longitude')}
            value={form.longitude}
            onChangeText={update('longitude')}
            keyboardType="decimal-pad"
          />
          <TextField
            label={t('farms.latitude')}
            value={form.latitude}
            onChangeText={update('latitude')}
            keyboardType="decimal-pad"
          />
          <Notice>{t('farms.locationOptional')}</Notice>
          {error ? <ErrorState message={error.message} /> : null}
          <View className="mt-4 flex-row gap-2">
            <View className="flex-1">
              <Button
                title={t('common.cancel')}
                variant="secondary"
                onPress={() => setShowForm(false)}
              />
            </View>
            <View className="flex-1">
              <Button title={t('common.create')} loading={saving} onPress={submit} />
            </View>
          </View>
        </Card>
      ) : null}

      {resource.loading && farms.length === 0 ? <LoadingState label={t('common.loading')} /> : null}
      {farms.length === 0 && !resource.loading ? <EmptyState title={t('farms.noFarms')} /> : null}

      {farms.map((farm) => {
        const location = farm.location || {};
        return (
          <Card
            key={farm.id}
            className="mb-3"
            onPress={() => setExpanded(expanded === farm.id ? null : farm.id)}
          >
            <Row label={t('farms.farmName')} value={farm.name || farm.code} />
            <Row
              label={t('farms.farmSize')}
              value={`${farm.area?.value ?? '—'} ${farm.area?.unit || ''} (${farm.area?.hectares ?? '—'} ha)`}
            />
            <Row
              label={t('common.location')}
              value={
                [location.addressLine, location.upazila?.name, location.district?.name]
                  .filter(Boolean)
                  .join(', ') || '—'
              }
              last={expanded !== farm.id}
            />
            {expanded === farm.id ? (
              <View className="mt-3 border-t border-slate-800 pt-2">
                <Row label={t('farms.division')} value={location.division?.name} />
                <Row label={t('farms.district')} value={location.district?.name} />
                <Row label={t('farms.upazila')} value={location.upazila?.name} />
                <Row label={t('farms.union')} value={location.union?.name} />
                <Row
                  label={t('farms.coordinatesAccess')}
                  value={farm.coordinatesAccess || '—'}
                  last
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
