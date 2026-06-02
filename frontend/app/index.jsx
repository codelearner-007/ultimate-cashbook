import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/store/authStore';
import SplashScreen from '../src/screens/SplashScreen';
import OnboardingScreen from '../src/screens/OnboardingScreen';

const ONBOARDING_KEY = 'onboarding_seen_v1';

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

  // null = still reading storage
  const [showOnboarding, setShowOnboarding] = useState(null);
  const [splashDone,     setSplashDone]     = useState(false);

  // Read storage immediately — runs in parallel with the splash animation
  useEffect(() => {
    storage.getItem(ONBOARDING_KEY)
      .then((val) => setShowOnboarding(val !== 'true'))
      .catch(()  => setShowOnboarding(false));
  }, []);

  function navigateAway() {
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
    navigateAway();
  }

  // When splash animation ends, decide what to show next
  function handleSplashFinish() {
    setSplashDone(true);
  }

  // Once splash is done AND we know if onboarding is needed → act
  useEffect(() => {
    if (!splashDone || showOnboarding === null) return;
    if (showOnboarding === false) {
      // Onboarding already seen — go straight to login/books
      navigateAway();
    }
    // showOnboarding === true → render OnboardingScreen below
  }, [splashDone, showOnboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1: always show animated splash first
  if (!splashDone) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // Phase 2a: storage still reading (extremely rare — splash takes 2.8 s)
  if (showOnboarding === null) {
    return null;
  }

  // Phase 2b: first install — show onboarding slides
  if (showOnboarding) {
    return <OnboardingScreen onFinish={handleOnboardingFinish} />;
  }

  // Phase 2c: navigateAway() already called above
  return null;
}
