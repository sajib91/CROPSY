import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = '@cropsy:onboarding:v1:';

export async function isOnboardingComplete(userId) {
  if (!userId) return true;
  try {
    return (await AsyncStorage.getItem(`${ONBOARDING_KEY}${userId}`)) === 'complete';
  } catch {
    return true;
  }
}

export async function setOnboardingComplete(userId) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${ONBOARDING_KEY}${userId}`, 'complete');
  } catch {
    // Onboarding remains usable for this session even if persistence fails.
  }
}
