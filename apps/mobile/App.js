import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { getMobileEnv } from './src/config/env';
import { checkApiHealth } from './src/lib/health';

export default function App() {
  const { apiUrl } = getMobileEnv();
  const [health, setHealth] = useState({ status: 'idle', message: 'Not checked yet' });

  async function handleHealthCheck() {
    setHealth({ status: 'loading', message: 'Checking...' });
    try {
      const response = await checkApiHealth();
      setHealth({ status: 'success', message: response.data.status });
    } catch (error) {
      setHealth({ status: 'error', message: error.message });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10">
        <View className="gap-4">
          <Text className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Foundation ready
          </Text>
          <Text className="text-4xl font-semibold text-white">CROPSY</Text>
          <Text className="text-base leading-6 text-slate-300">
            The mobile workspace is configured. No business features have been implemented yet.
          </Text>
          <View className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <Text className="text-xs text-slate-400">API base URL</Text>
            <Text className="mt-1 font-mono text-sm text-emerald-300">{apiUrl}</Text>
          </View>
          <View className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <Text className="text-xs text-slate-400">API health</Text>
            <Text className="mt-1 text-sm text-white">{health.message}</Text>
          </View>
          <Pressable
            className="rounded-lg bg-emerald-500 px-4 py-3 active:bg-emerald-600"
            onPress={handleHealthCheck}
          >
            <Text className="text-center font-semibold text-slate-950">Check API health</Text>
          </Pressable>
        </View>
      </ScrollView>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}
