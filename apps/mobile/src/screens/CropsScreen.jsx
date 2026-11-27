import { useMemo, useState } from 'react';
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
  Tabs,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const CROP_CATEGORIES = [
  'CEREAL',
  'PULSE',
  'OILSEED',
  'VEGETABLE',
  'FRUIT',
  'ROOT_CROP',
  'SPICE',
  'LIVESTOCK',
  'FISHERY',
  'OTHER',
];

const CULTIVATION_STATUSES = ['PLANNED', 'ACTIVE', 'HARVESTED', 'FAILED', 'CANCELLED'];

const EMPTY_FORM = {
  code: '',
  name: '',
  nameBn: '',
  category: 'OTHER',
  varietyCropId: '',
  varietyCode: '',
  varietyName: '',
  farmId: '',
  cropVarietyId: '',
  areaHectares: '',
  status: 'PLANNED',
  sownAt: '',
  expectedHarvestAt: '',
  notes: '',
};

function asArray(data, key) {
  return Array.isArray(data) ? data : data?.[key] || [];
}

export default function CropsScreen() {
  const { api, t } = useApp();
  const [tab, setTab] = useState('crops');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const crops = useResource('crops', () => api.get(endpoints.agriculture.crops));
  const varieties = useResource('varieties', () => api.get(endpoints.agriculture.varieties));
  const cultivations = useResource('cultivations', () =>
    api.get(endpoints.agriculture.cultivations),
  );
  const farms = useResource('farms', () => api.get(endpoints.farmers.farms));

  const cropList = useMemo(() => asArray(crops.data, 'crops'), [crops.data]);
  const varietyList = useMemo(() => asArray(varieties.data, 'varieties'), [varieties.data]);
  const cultivationList = useMemo(
    () => asArray(cultivations.data, 'cultivations'),
    [cultivations.data],
  );
  const farmList = useMemo(() => asArray(farms.data, 'farms'), [farms.data]);

  const update = (field) => (value) => setForm((previous) => ({ ...previous, [field]: value }));

  const isoDateTime = (value) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(t('common.invalidDate'));
    return parsed.toISOString();
  };

  const createCrop = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.post(endpoints.agriculture.crops, {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        ...(form.nameBn.trim() ? { nameBn: form.nameBn.trim() } : {}),
        category: form.category,
      });
      setForm((previous) => ({ ...previous, code: '', name: '', nameBn: '' }));
      await crops.refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const createVariety = async () => {
    if (!form.varietyCropId) {
      setError(new Error(t('crops.selectCrop')));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.post(endpoints.agriculture.cropVarieties(form.varietyCropId), {
        code: form.varietyCode.trim().toUpperCase(),
        name: form.varietyName.trim(),
      });
      setForm((previous) => ({ ...previous, varietyCode: '', varietyName: '' }));
      await varieties.refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const startCultivation = async () => {
    if (!form.farmId || !form.cropVarietyId) {
      setError(new Error(t('crops.selectFarmAndVariety')));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.post(endpoints.agriculture.cultivations, {
        farmId: form.farmId,
        cropVarietyId: form.cropVarietyId,
        areaHectares: Number(form.areaHectares),
        status: form.status,
        ...(form.sownAt ? { sownAt: isoDateTime(form.sownAt) } : {}),
        ...(form.expectedHarvestAt
          ? { expectedHarvestAt: isoDateTime(form.expectedHarvestAt) }
          : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      setForm((previous) => ({
        ...previous,
        areaHectares: '',
        sownAt: '',
        expectedHarvestAt: '',
        notes: '',
      }));
      await cultivations.refresh();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const activeTab = tab === 'cultivations' ? cultivations : crops;
  const activeList = tab === 'cultivations' ? cultivationList : cropList;
  const cropNameById = Object.fromEntries(cropList.map((crop) => [crop.id, crop.name]));
  const farmNameById = Object.fromEntries(farmList.map((farm) => [farm.id, farm.name]));
  const varietyNameById = Object.fromEntries(
    varietyList.map((variety) => [
      variety.id,
      `${variety.name || variety.code} · ${cropNameById[variety.cropId] || ''}`.trim(),
    ]),
  );

  return (
    <Screen
      header={<ScreenHeader title={t('crops.title')} />}
      refreshing={activeTab.refreshing}
      onRefresh={activeTab.refresh}
    >
      <Tabs
        tabs={[
          { key: 'crops', label: t('crops.title') },
          { key: 'cultivations', label: t('crops.cultivations') },
        ]}
        active={tab}
        onChange={setTab}
      />

      <Card className="mb-5">
        {tab === 'crops' ? (
          <View>
            <TextField label={t('crops.code')} value={form.code} onChangeText={update('code')} />
            <TextField
              label={t('crops.cropName')}
              value={form.name}
              onChangeText={update('name')}
            />
            <TextField
              label={t('crops.nameBn')}
              value={form.nameBn}
              onChangeText={update('nameBn')}
            />
            <OptionPicker
              label={t('common.category')}
              options={CROP_CATEGORIES.map((category) => ({ value: category, label: category }))}
              value={form.category}
              onChange={update('category')}
            />
            <Button title={t('crops.addCrop')} loading={saving} onPress={createCrop} />
          </View>
        ) : (
          <View>
            <OptionPicker
              label={t('farms.title')}
              options={farmList.map((farm) => ({ value: farm.id, label: farm.name }))}
              value={form.farmId}
              onChange={update('farmId')}
              placeholder={t('farms.noFarms')}
            />
            <OptionPicker
              label={t('crops.cropVariety')}
              options={varietyList.map((variety) => ({
                value: variety.id,
                label: varietyNameById[variety.id],
              }))}
              value={form.cropVarietyId}
              onChange={update('cropVarietyId')}
              placeholder={t('crops.noVarieties')}
            />
            <TextField
              label={t('crops.areaHectares')}
              value={form.areaHectares}
              onChangeText={update('areaHectares')}
              keyboardType="decimal-pad"
            />
            <OptionPicker
              label={t('common.status')}
              options={CULTIVATION_STATUSES.map((status) => ({ value: status, label: status }))}
              value={form.status}
              onChange={update('status')}
            />
            <TextField
              label={t('crops.plantDate')}
              value={form.sownAt}
              onChangeText={update('sownAt')}
              placeholder="YYYY-MM-DD"
              helper={t('crops.isoDateHint')}
            />
            <TextField
              label={t('crops.harvestDate')}
              value={form.expectedHarvestAt}
              onChangeText={update('expectedHarvestAt')}
              placeholder="YYYY-MM-DD"
              helper={t('crops.isoDateHint')}
            />
            <TextField
              label={t('crops.notes')}
              value={form.notes}
              onChangeText={update('notes')}
              multiline
            />
            <Button
              title={t('crops.startCultivation')}
              loading={saving}
              onPress={startCultivation}
            />
          </View>
        )}
      </Card>

      {tab === 'crops' ? (
        <Card className="mb-5">
          <OptionPicker
            label={t('crops.selectCrop')}
            options={cropList.map((crop) => ({ value: crop.id, label: crop.name || crop.code }))}
            value={form.varietyCropId}
            onChange={update('varietyCropId')}
            placeholder={t('crops.noCrops')}
          />
          <TextField
            label={t('crops.varietyCode')}
            value={form.varietyCode}
            onChangeText={update('varietyCode')}
          />
          <TextField
            label={t('crops.varietyName')}
            value={form.varietyName}
            onChangeText={update('varietyName')}
          />
          <Button title={t('crops.addVariety')} loading={saving} onPress={createVariety} />
        </Card>
      ) : null}

      {error ? <ErrorState message={error.message || t('common.errorTitle')} /> : null}
      {activeTab.error ? (
        <ErrorState
          message={activeTab.error.message}
          onRetry={activeTab.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {activeTab.loading && activeList.length === 0 ? (
        <LoadingState label={t('common.loading')} />
      ) : null}
      {activeList.length === 0 && !activeTab.loading ? (
        <EmptyState title={t('crops.noCrops')} />
      ) : null}

      {activeList.map((item, index) => (
        <Card key={item.id || index} className="mb-3">
          {tab === 'cultivations' ? (
            <View>
              <Row label={t('crops.cropVariety')} value={varietyNameById[item.cropVarietyId]} />
              <Row label={t('farms.title')} value={farmNameById[item.farmId]} />
              <Row label={t('crops.areaHectares')} value={item.areaHectares} />
              <Row label={t('crops.plantDate')} value={item.sownAt} />
              <Row label={t('crops.harvestDate')} value={item.expectedHarvestAt} />
              <Row label={t('crops.notes')} value={item.notes} />
              <Row label={t('common.status')} value={item.status} last />
            </View>
          ) : (
            <View>
              <Row label={t('crops.code')} value={item.code} />
              <Row label={t('common.name')} value={item.name} />
              <Row label={t('crops.nameBn')} value={item.nameBn} />
              <Row label={t('common.category')} value={item.category} last />
            </View>
          )}
        </Card>
      ))}

      {tab === 'cultivations' && farmList.length === 0 ? (
        <Notice tone="warning">{t('farms.noFarms')}</Notice>
      ) : null}
    </Screen>
  );
}
