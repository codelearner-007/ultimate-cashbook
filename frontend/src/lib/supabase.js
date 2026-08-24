import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { resolveDevUrl } from './devHost';

// Native (iOS / Android) — encrypted hardware storage
const NativeStorage = {
  getItem:    (key)        => SecureStore.getItemAsync(key),
  setItem:    (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key)        => SecureStore.deleteItemAsync(key),
};

// Web — localStorage (SecureStore is unavailable in browser)
const WebStorage = {
  getItem:    (key)        => Promise.resolve(localStorage.getItem(key)),
  setItem:    (key, value) => Promise.resolve(localStorage.setItem(key, value)),
  removeItem: (key)        => Promise.resolve(localStorage.removeItem(key)),
};

// Web browser can't reach a LAN IP (e.g. http://192.168.x.x) — fall back to
// the localhost override meant for running Supabase on the same machine.
// Native dev builds auto-detect the current LAN IP instead of trusting the
// (DHCP-assigned, easily stale) hardcoded value in .env — see devHost.js.
const SUPABASE_URL = Platform.OS === 'web'
  ? (process.env.EXPO_PUBLIC_SUPABASE_URL_WEB || process.env.EXPO_PUBLIC_SUPABASE_URL)
  : resolveDevUrl(54321, process.env.EXPO_PUBLIC_SUPABASE_URL);

export const supabase = createClient(
  SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage:            Platform.OS === 'web' ? WebStorage : NativeStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);
