import { useState } from 'react';
import { View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { setOnboardingComplete } from '../lib/auth/onboarding';
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

const ROLE_OPTIONS = [
  { value: 'FARMER', labelKey: 'onboarding.farmer' },
  { value: 'BUYER', labelKey: 'onboarding.buyer' },
  { value: 'WHOLESALER', labelKey: 'onboarding.wholesaler' },
  { value: 'RETAILER', labelKey: 'onboarding.retailer' },
  { value: 'SUPPLIER', labelKey: 'onboarding.supplier' },
  { value: 'LOGISTICS', labelKey: 'onboarding.logistics' },
  { value: 'WAREHOUSE', labelKey: 'onboarding.warehouse' },
  { value: 'EXPERT', labelKey: 'onboarding.expert' },
  { value: 'INSPECTOR', labelKey: 'onboarding.inspector' },
];

const DEFAULT_ROLE_DATA = '{"source":"mobile"}';

export default function OnboardingScreen({ navigation }) {
  const { api, t, session, refreshProfile, language } = useApp();
  const [role, setRole] = useState('FARMER');
  const [farmSize, setFarmSize] = useState('');
  const [experience, setExperience] = useState('');
  const [primaryCropId, setPrimaryCropId] = useState('');
  const [farmerCode, setFarmerCode] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [roleData, setRoleData] = useState(DEFAULT_ROLE_DATA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const crops = useResource('crops', () => api.get(endpoints.agriculture.crops));
  const cropList = Array.isArray(crops.data) ? crops.data : crops.data?.crops || [];

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (role === 'FARMER') {
        await api.put(endpoints.users.farmerProfile, {
          ...(farmSize ? { farmSizeHectares: Number(farmSize) } : {}),
          ...(experience ? { experienceYears: Number(experience) } : {}),
          ...(primaryCropId ? { primaryCropId } : {}),
          ...(farmerCode ? { farmerCode: farmerCode.trim().toUpperCase() } : {}),
          ...(organizationId ? { organizationId: organizationId.trim() } : {}),
        });
      } else {
        let parsedData;
        try {
          parsedData = JSON.parse(roleData);
        } catch {
          throw new Error(t('onboarding.invalidRoleData'));
        }
        if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
          throw new Error(t('onboarding.invalidRoleData'));
        }
        await api.put(endpoints.users.roleProfile(role), {
          ...(organizationId ? { organizationId: organizationId.trim() } : {}),
          data: parsedData,
        });
      }
      await refreshProfile();
      await setOnboardingComplete(session?.user?.id || session?.user?.sub);
      navigation.replace('Main');
    } catch (setupError) {
      setError(setupError);
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await setOnboardingComplete(session?.user?.id || session?.user?.sub);
    navigation.replace('Main');
  };

  return (
    <Screen
      header={<ScreenHeader title={t('onboarding.title')} subtitle={t('onboarding.subtitle')} />}
    >
      <Card>
        <OptionPicker
          label={t('onboarding.selectRole')}
          options={ROLE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          value={role}
          onChange={setRole}
        />
        {role === 'FARMER' ? (
          <View>
            <TextField
              label={t('onboarding.farmSize')}
              value={farmSize}
              onChangeText={setFarmSize}
              keyboardType="decimal-pad"
            />
            <TextField
              label={t('onboarding.experienceYears')}
              value={experience}
              onChangeText={setExperience}
              keyboardType="numeric"
            />
            <OptionPicker
              label={t('onboarding.primaryCropId')}
              options={cropList.map((crop) => ({
                value: crop.id,
                label: (language === 'bn' && crop.nameBn) || crop.name || crop.code,
              }))}
              value={primaryCropId}
              onChange={setPrimaryCropId}
              placeholder={t('crops.noCrops')}
            />
            <TextField
              label={t('onboarding.farmerCode')}
              value={farmerCode}
              onChangeText={setFarmerCode}
              placeholder="FARMER-001"
              autoCapitalize="characters"
            />
          </View>
        ) : (
          <TextField
            label={t('onboarding.roleData')}
            value={roleData}
            onChangeText={setRoleData}
            multiline
            helper={t('onboarding.roleDataHint')}
          />
        )}
        <TextField
          label={t('onboarding.organizationId')}
          value={organizationId}
          onChangeText={setOrganizationId}
          autoCapitalize="none"
        />
        <Notice>{t('common.optional')}</Notice>
        {error ? <ErrorState message={error.message || t('common.errorTitle')} /> : null}
        <View className="mt-5">
          <Button title={t('onboarding.finish')} loading={busy} onPress={finish} />
        </View>
        <View className="mt-2">
          <Button title={t('onboarding.skip')} variant="ghost" onPress={skip} />
        </View>
      </Card>
    </Screen>
  );
}
