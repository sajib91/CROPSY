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
  Notice,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

function profileName(profile) {
  if (!profile) return '';
  const first = profile.firstName || profile.profile?.firstName || '';
  const last = profile.lastName || profile.profile?.lastName || '';
  return `${first} ${last}`.trim();
}

export default function ProfileScreen() {
  const { api, t, profile, setProfile, session, refreshProfile } = useApp();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', preferredLanguage: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const resource = useResource('profile', refreshProfile, { deps: [] });

  const startEditing = () => {
    setForm({
      firstName: profile?.firstName || profile?.profile?.firstName || '',
      lastName: profile?.lastName || profile?.profile?.lastName || '',
      preferredLanguage: String(
        profile?.preferredLanguage || profile?.profile?.preferredLanguage || 'EN',
      ).toUpperCase(),
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.patch(endpoints.users.updateProfile, {
        firstName: form.firstName,
        lastName: form.lastName,
        preferredLanguage: form.preferredLanguage,
      });
      setProfile(updated);
      setMessage(t('common.saved'));
      setEditing(false);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  if (resource.loading && !profile) return <LoadingState label={t('common.loading')} />;

  return (
    <Screen
      header={
        <ScreenHeader title={t('profile.title')} subtitle={profileName(profile) || undefined} />
      }
      refreshing={resource.refreshing}
      onRefresh={refreshProfile}
    >
      {resource.error || error ? (
        <ErrorState
          message={(resource.error || error).message || t('common.errorTitle')}
          onRetry={refreshProfile}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {message ? <Notice>{message}</Notice> : null}

      <Card>
        <View className="flex-row items-center justify-between">
          <View className="mr-4 flex-1">
            <Badge tone="info">{profile?.verificationStatus || session?.user?.status || '—'}</Badge>
          </View>
        </View>
        <Row label={t('common.name')} value={profileName(profile)} />
        <Row
          label={t('profile.email')}
          value={profile?.email || profile?.contact?.email || session?.user?.email}
        />
        <Row
          label={t('profile.phone')}
          value={profile?.phone || profile?.contact?.phone || session?.user?.phone}
        />
        <Row
          label={t('profile.preferredLanguage')}
          value={profile?.preferredLanguage || profile?.profile?.preferredLanguage}
        />
        <Row
          label={t('profile.organization')}
          value={
            profile?.organizations?.[0]?.name ||
            profile?.organizations?.[0]?.id ||
            session?.organizationId ||
            '—'
          }
          last
        />
        {!editing ? (
          <View className="mt-4">
            <Button title={t('profile.editProfile')} variant="secondary" onPress={startEditing} />
          </View>
        ) : null}
      </Card>

      {editing ? (
        <Card className="mt-4">
          <TextField
            label={t('auth.firstName')}
            value={form.firstName}
            onChangeText={(value) => setForm((previous) => ({ ...previous, firstName: value }))}
          />
          <TextField
            label={t('auth.lastName')}
            value={form.lastName}
            onChangeText={(value) => setForm((previous) => ({ ...previous, lastName: value }))}
          />
          <View className="mb-4 flex-row gap-2">
            {['EN', 'BN'].map((code) => (
              <Button
                key={code}
                title={code === 'EN' ? t('ai.english') : t('ai.bangla')}
                variant={form.preferredLanguage === code ? 'primary' : 'secondary'}
                onPress={() => setForm((previous) => ({ ...previous, preferredLanguage: code }))}
              />
            ))}
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title={t('common.cancel')}
                variant="secondary"
                onPress={() => setEditing(false)}
              />
            </View>
            <View className="flex-1">
              <Button title={t('profile.saveProfile')} loading={saving} onPress={save} />
            </View>
          </View>
        </Card>
      ) : null}

      <SectionHeader title={t('profile.roleProfiles')} />
      <RoleProfiles />

      <SectionHeader title={t('profile.addresses')} />
      <Addresses />
    </Screen>
  );
}

function RoleProfiles() {
  const { api, t } = useApp();
  const resource = useResource('role-profiles', () => api.get(endpoints.users.roleProfiles), {
    deps: [],
  });

  const roleCodes = Array.isArray(resource.data?.roleCodes) ? resource.data.roleCodes : [];
  const extensions = Array.isArray(resource.data?.extensions) ? resource.data.extensions : [];
  const farmerProfile = resource.data?.farmerProfile || null;
  const isEmpty = roleCodes.length === 0 && extensions.length === 0 && !farmerProfile;

  return (
    <Card>
      {resource.loading ? <LoadingState label={t('common.loading')} /> : null}
      {resource.error ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {isEmpty && !resource.loading ? <Notice>{t('common.noData')}</Notice> : null}

      {roleCodes.map((roleCode, index) => (
        <Row
          key={roleCode}
          label={t('profile.roleCodes')}
          value={roleCode}
          last={!farmerProfile && extensions.length === 0 && index === roleCodes.length - 1}
        />
      ))}

      {farmerProfile ? (
        <View className="mt-3 border-t border-slate-800 pt-3">
          <Badge tone="info">{t('profile.farmerProfile')}</Badge>
          <Row label={t('profile.farmerCode')} value={farmerProfile.farmerCode} />
          <Row label={t('profile.verificationStatus')} value={farmerProfile.verificationStatus} />
          <Row label={t('profile.farmSizeHectares')} value={farmerProfile.farmSizeHectares} />
          <Row label={t('profile.experienceYears')} value={farmerProfile.experienceYears} />
          <Row label={t('profile.primaryCropId')} value={farmerProfile.primaryCropId} />
          <Row
            label={t('profile.organization')}
            value={farmerProfile.organizationId}
            last={extensions.length === 0}
          />
        </View>
      ) : null}

      {extensions.map((extension, index) => (
        <View
          key={extension.id || `${extension.roleCode}-${index}`}
          className="mt-3 border-t border-slate-800 pt-3"
        >
          <Badge tone="info">{extension.roleCode}</Badge>
          <Row label={t('profile.extensions')} value={extension.scopeKey} />
          <Row label={t('profile.organization')} value={extension.organizationId} />
          <Row
            label={t('common.type')}
            value={JSON.stringify(extension.data || {})}
            last={index === extensions.length - 1}
          />
        </View>
      ))}
    </Card>
  );
}

function Addresses() {
  const { api, t } = useApp();
  const resource = useResource('addresses', () => api.get(endpoints.users.addresses), { deps: [] });
  const addresses = Array.isArray(resource.data) ? resource.data : resource.data?.addresses || [];

  return (
    <Card>
      {resource.loading ? <LoadingState label={t('common.loading')} /> : null}
      {resource.error ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
          retryLabel={t('common.retry')}
        />
      ) : null}
      {addresses.length === 0 && !resource.loading ? (
        <Notice>{t('profile.noAddresses')}</Notice>
      ) : null}
      {addresses.map((item, index) => (
        <Row
          key={item.id || index}
          label={item.label || item.type || `${t('common.location')} ${index + 1}`}
          value={
            [item.addressLine1, item.district, item.division].filter(Boolean).join(', ') || '—'
          }
          last={index === addresses.length - 1}
        />
      ))}
    </Card>
  );
}
