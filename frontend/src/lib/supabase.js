import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { resolveDevUrl } from './devHost';

// SecureStore enforces a per-key size ceiling on Android (its Keystore-backed
// storage historically caps a single value around ~2048 bytes). A Supabase
// session — access token + refresh token + the full user record, which grows
// with Google OAuth metadata like avatar_url/full_name — can exceed that.
// Writing over the limit fails; if that failure isn't caught, the session
// silently never gets saved, and the very next cold start finds nothing to
// restore, looking exactly like an unexplained logout. To fix this without
// adding a new storage dependency, large values are split into chunks that
// each stay under the limit and reassembled on read.
const CHUNK_SIZE = 1800;
const chunkKey = (key, i) => `${key}__c${i}`;
const chunkCountKey = (key) => `${key}__cc`;

async function secureGetItem(key) {
  try {
    const direct = await SecureStore.getItemAsync(key);
    if (direct !== null) return direct;

    const countStr = await SecureStore.getItemAsync(chunkCountKey(key));
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    if (parts.some((p) => p === null)) return null; // partial/corrupted write — treat as no session
    return parts.join('');
  } catch (e) {
    console.warn('[supabase] failed to read stored session, treating as signed out', e);
    return null;
  }
}

async function secureRemoveItem(key) {
  try {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    const countStr = await SecureStore.getItemAsync(chunkCountKey(key)).catch(() => null);
    if (countStr) {
      const count = parseInt(countStr, 10) || 0;
      await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {})),
      );
      await SecureStore.deleteItemAsync(chunkCountKey(key)).catch(() => {});
    }
  } catch (e) {
    console.warn('[supabase] failed to clear stored session', e);
  }
}

async function secureSetItem(key, value) {
  try {
    // Clear any previous chunked write first — a shrinking value must not
    // leave stale trailing chunks behind for the next read to reassemble.
    await secureRemoveItem(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
  } catch (e) {
    // Never let a storage failure throw out of the auth flow — but do not
    // pretend it succeeded either; the session simply won't survive a
    // restart, which is recoverable (re-login) rather than a crash.
    console.warn('[supabase] failed to persist session — you may be signed out on next launch', e);
  }
}

// Native (iOS / Android) — encrypted hardware storage, chunked to stay under
// SecureStore's per-key size limit (see above).
const NativeStorage = {
  getItem:    (key)        => secureGetItem(key),
  setItem:    (key, value) => secureSetItem(key, value),
  removeItem: (key)        => secureRemoveItem(key),
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

// `autoRefreshToken` renews the access token on a JS timer, but React Native
// suspends JS timers while the app is backgrounded (and drops them entirely
// if the OS kills the app). Left unmanaged, a session can sit un-refreshed
// through a long background period; on reopen the stale access token gets
// rejected by the backend before a refresh has a chance to run, which looks
// like the user was logged out even though their refresh token was still
// good. Supabase's own React Native guidance is to drive the refresh timer
// from app foreground/background state directly, so a refresh is forced
// the moment the app becomes active again — before any screen's first
// API call can race it.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
