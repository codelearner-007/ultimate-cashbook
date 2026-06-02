import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/store/authStore';
import SplashScreen from '../src/screens/SplashScreen';
import OnboardingScreen from '../src/screens/OnboardingScreen';

const ONBOARDING_KEY = 'onboarding_seen_v1';

// Web fallback — SecureStore is not available in browsers
const storage = {
  getItem: (key) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
};

export default function Index() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  // null = still checking, true = show onboarding, false = skip to next screen
  const [showOnboarding, setShowOnboarding] = useState(null);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    storage.getItem(ONBOARDING_KEY).then((val) => {
      setShowOnboarding(val !== 'true');
    }).catch(() => {
      setShowOnboarding(false);
    });
  }, []);

  function navigateAfterOnboarding() {
    if (!user) {
      router.replace('/(auth)/login');
    } else if (user.role === 'superadmin') {
      router.replace('/(app)/dashboard/users');
    } else {
      router.replace('/(app)/books');
    }
  }

  async function handleOnboardingFinish() {
    await storage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    navigateAfterOnboarding();
  }

  function handleSplashFinish() {
    setSplashDone(true);
    // showOnboarding state drives the render; if it's already resolved to false,
    // the useEffect below will catch the splashDone change and navigate.
  }

  // Navigate away as soon as both splash is done AND storage is read (showOnboarding === false)
  useEffect(() => {
    if (splashDone && showOnboarding === false) {
      navigateAfterOnboarding();
    }
  }, [splashDone, showOnboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show splash first — always
  if (!splashDone) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // Still reading storage — splash is done but we don't know yet → skip straight through
  // (very rare, storage read is fast; avoids any blank flash)
  if (showOnboarding === null) {
    return null;
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  // Should not reach here — handleSplashFinish navigates away when showOnboarding is false
  return null;
}
