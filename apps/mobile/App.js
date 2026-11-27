import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from './src/lib/ui/components';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { AppProvider, useApp } from './src/state/AppContext';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#34d399',
    background: '#020617',
    card: '#0f172a',
    border: '#1e293b',
    text: '#f8fafc',
  },
};

function RootNavigator() {
  const { ready } = useApp();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <LoadingState label="Preparing CROPSY…" />
      </View>
    );
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
