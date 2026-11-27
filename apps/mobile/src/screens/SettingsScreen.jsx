import { Alert, View } from 'react-native';

import { clearAppCache } from '../lib/storage/cache';
import {
  Button,
  Card,
  ClickableRow,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

export default function SettingsScreen() {
  const { t, language, setLanguage, signOut, env, clearSessionState } = useApp();

  const confirmSignOut = () => {
    Alert.alert(t('common.signOut'), t('settings.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.signOut'), style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <Screen header={<ScreenHeader title={t('settings.title')} />}>
      <SectionHeader title={t('settings.appearance')} />
      <Card>
        <ClickableRow
          title={t('settings.english')}
          onPress={() => setLanguage('en')}
          right={
            <View className="h-5 w-5 rounded-full border-2 border-emerald-400 bg-emerald-500" />
          }
        />
        <ClickableRow
          title={t('settings.bangla')}
          onPress={() => setLanguage('bn')}
          right={
            <View className="h-5 w-5 rounded-full border-2 border-emerald-400 bg-emerald-500" />
          }
        />
        <Row label={t('common.language')} value={language.toUpperCase()} last />
      </Card>

      <SectionHeader title={t('settings.about')} />
      <Card>
        <Row label={t('settings.version')} value="0.1.0" />
        <Row
          label={t('settings.pushStatus')}
          value={env.pushEnabled ? t('settings.enabled') : t('settings.disabled')}
        />
        <Row
          label={t('settings.realtimeStatus')}
          value={env.realtimeEnabled ? t('settings.enabled') : t('settings.disabled')}
          last
        />
      </Card>

      <SectionHeader title={t('common.settings')} />
      <Card>
        <ClickableRow
          title={t('settings.clearCache')}
          onPress={async () => {
            await clearAppCache();
            clearSessionState?.();
          }}
        />
      </Card>

      <View className="mt-8">
        <Button title={t('common.signOut')} variant="danger" onPress={confirmSignOut} />
      </View>
    </Screen>
  );
}
