import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../../src/lib/supabase';
import { LightColors } from '../../src/constants/colors';

// Google OAuth deep-link handler.
// After Supabase redirects back to cashbook://auth/callback, Expo Router
// mounts this screen. We extract the code from the URL and let supabase-js
// exchange it for a session; onAuthStateChange in _layout.jsx fires and
// AuthGuard redirects the user to the correct screen.
export default function AuthCallback() {
  useEffect(() => {
    Linking.getInitialURL().then(async (url) => {
      if (!url) return;
      try {
        await supabase.auth.exchangeCodeForSession(url);
        // onAuthStateChange → SupabaseAuthListener → setUser → AuthGuard redirects
      } catch {
        // Silent — the main login screen shows an error if needed
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={LightColors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
