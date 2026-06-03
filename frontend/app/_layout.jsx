import { useEffect, useState, useRef } from 'react';
import { Platform, Modal, View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import Toast from '../src/lib/toast';
import { toastConfig } from '../src/components/ui/AppToast';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';
import { useSyncStore }  from '../src/store/syncStore';
import * as Network     from 'expo-network';
import { supabase } from '../src/lib/supabase';
import { apiGetProfile } from '../src/lib/api';
import { useUnreadNotifications, useMarkNotificationRead } from '../src/hooks/useNotifications';
import { useTheme } from '../src/hooks/useTheme';
import { Font } from '../src/constants/fonts';
import {
  setupNotificationHandlers,
  registerPushToken,
  addNotificationTapListener,
} from '../src/lib/pushNotifications';
import { syncCloudToLocal } from '../src/lib/syncManager';
import { localGetBooks } from '../src/lib/localDb';
import { apiGetBooks as apiGetCloudBooks } from '../src/lib/api';
import * as SecureStore from 'expo-secure-store';
import { useNotificationPopupStore } from '../src/store/notificationPopupStore';
import { useNotifications } from '../src/hooks/useNotifications';

// Configure foreground notification display (native only; no-op on web)
setupNotificationHandlers();

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2 * 60 * 1000, retry: 1 },
  },
});

function NetworkMonitor() {
  const setOnline = useSyncStore(s => s.setOnline);
  useEffect(() => {
    // Initial check
    Network.getNetworkStateAsync()
      .then(state => setOnline(!!state.isConnected && !!state.isInternetReachable))
      .catch(() => {});
    // Real-time connectivity changes (fires immediately when network toggles)
    const netSub = Network.addNetworkStateListener(state => {
      setOnline(!!state.isConnected && !!state.isInternetReachable);
    });
    // Also re-verify when the app returns to foreground
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Network.getNetworkStateAsync()
          .then(s => setOnline(!!s.isConnected && !!s.isInternetReachable))
          .catch(() => {});
      }
    });
    return () => {
      netSub.remove();
      appSub.remove();
    };
  }, [setOnline]);
  return null;
}


/**
 * Checks once per device install whether cloud has data the user would want
 * to restore. If local is empty AND cloud has books, sets showRestorePrompt=true
 * so the user sees a modal asking whether to restore.
 * The actual sync is triggered by RestoreCloudModal on user confirmation.
 */
function InitialPullMonitor() {
  const user             = useAuthStore(s => s.user);
  const isOnline         = useSyncStore(s => s.isOnline);
  const isSyncing        = useSyncStore(s => s.isSyncing);
  const setRestorePrompt = useSyncStore(s => s.setRestorePrompt);
  const checkLock        = useRef(false);

  const isEligible = (u) => {
    if (!u) return false;
    if (u.role === 'superadmin') return true;
    const tier = u?.subscription_tier;
    return tier && tier !== 'free';
  };

  useEffect(() => {
    if (!user || !isOnline || isSyncing || checkLock.current) return;
    if (!isEligible(user)) return;

    const PULL_FLAG = `cashbook_initial_pull_done_${user.id}`;

    SecureStore.getItemAsync(PULL_FLAG)
      .then(async (done) => {
        if (done) return; // already decided on this device

        const localBooks = await localGetBooks().catch(() => []);
        if (localBooks.length > 0) {
          // Local data exists — no need to prompt
          SecureStore.setItemAsync(PULL_FLAG, '1').catch(() => {});
          return;
        }

        // Local is empty — check if cloud has any books
        checkLock.current = true;
        try {
          const cloudBooks = await apiGetCloudBooks();
          if (cloudBooks && cloudBooks.length > 0) {
            // Cloud has data → ask the user what they want
            setRestorePrompt(true);
          } else {
            // Cloud is also empty — nothing to restore, mark done
            SecureStore.setItemAsync(PULL_FLAG, '1').catch(() => {});
          }
        } catch {
          // Network error — silently skip; will re-check on next session
        } finally {
          checkLock.current = false;
        }
      })
      .catch(() => {});
  }, [user, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function AuthGuard() {
  const user     = useAuthStore((s) => s.user);
  const router   = useRouter();
  const segments = useSegments();
  const [navReady, setNavReady] = useState(false);

  // Wait one full render cycle so Expo Router's assertIsReady passes
  useEffect(() => { setNavReady(true); }, []);

  useEffect(() => {
    if (!navReady) return;

    const inApp  = segments[0] === '(app)';
    const inAuth = segments[0] === '(auth)';
    // segments[0] === undefined means we're on the root index (animated splash) — don't interrupt it
    const onIndex = segments[0] === undefined;

    if (!user && inApp) {
      router.replace('/(auth)/login');
    } else if (user && !inApp && !onIndex) {
      if (user.role === 'superadmin') {
        router.replace('/(app)/dashboard/users');
      } else {
        router.replace('/(app)/books');
      }
    }
  }, [user, segments, navReady]);

  return null;
}

// Fetch profile: try backend → Supabase direct → build from session
async function resolveProfile(session) {
  try {
    return await apiGetProfile();
  } catch {
    // Backend not running — read directly from profiles table
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (data) return data;
    // profiles table not set up yet — build minimal profile from Google session.
    // Preserve role from session metadata so superadmin is not downgraded to 'user'
    // when the backend is temporarily unreachable.
    const u = session.user;
    const role = u.user_metadata?.role || u.app_metadata?.role || 'user';
    return {
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || u.user_metadata?.name || u.email,
      avatar_url: u.user_metadata?.avatar_url || null,
      role,
      is_active: true,
    };
  }
}

function SupabaseAuthListener() {
  const setUser   = useAuthStore((s) => s.setUser);
  const clearUser = useAuthStore((s) => s.clearUser);
  const setIsDark = useThemeStore((s) => s.setIsDark);

  useEffect(() => {
    // Restore session on app start
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const profile = await resolveProfile(session);
        setUser(profile, session);
        if (profile.is_dark_mode !== undefined) setIsDark(!!profile.is_dark_mode);
        // Register push token after restoring session
        registerPushToken();
      }
    });

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const profile = await resolveProfile(session);
          setUser(profile, session);
          if (profile.is_dark_mode !== undefined) setIsDark(!!profile.is_dark_mode);
          // Register push token on every sign-in (token may have rotated)
          registerPushToken();
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          clearUser();
          setIsDark(false);
          queryClient.clear();
        } else if (event === 'TOKEN_REFRESHED' && session) {
          const prev = useAuthStore.getState().user;
          if (prev) setUser(prev, session);
        }
      },
    );

    // Handle taps on push notifications that opened the app
    const tapSub = addNotificationTapListener((response) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      const notifId = response?.notification?.request?.content?.data?.notification_id;
      if (notifId) {
        useNotificationPopupStore.getState().setTappedId(notifId);
      }
    });

    return () => {
      subscription.unsubscribe();
      tapSub.remove();
    };
  }, []);

  return null;
}

// ── Notification Pop-up (regular users only) ───────────────────────────────────
//
// Shows a centered modal card for each unread notification, one at a time.
// Checks for new ones every time the app returns to foreground (AppState).

function NotificationPopup() {
  const user       = useAuthStore((s) => s.user);
  const { C }      = useTheme();
  const loggedIn   = !!user;
  const isUser     = loggedIn && user.role === 'user';

  // Tray-tap: any logged-in user (including admin)
  const tappedId     = useNotificationPopupStore((s) => s.tappedId);
  const clearTapped  = useNotificationPopupStore((s) => s.clearTappedId);

  // Full inbox — needed to look up tapped notification (may already be read)
  const { data: allNotifs = [], refetch: refetchAll } = useNotifications({
    enabled: loggedIn && !!tappedId,
  });

  // Unread — only for regular users (auto popup on every unread)
  const { data: unread = [], refetch } = useUnreadNotifications({ enabled: isUser });
  const markRead = useMarkNotificationRead();

  // Refetch when app returns to foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        refetch();
        if (tappedId) refetchAll();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [refetch, refetchAll, tappedId]);

  // Resolve which notification to show
  // Priority: tapped from tray > first unread (user only)
  const tappedNotif = tappedId
    ? allNotifs.find((n) => n.notification_id === tappedId)
    : null;
  const current = tappedNotif ?? (isUser ? unread[0] : null);

  if (!current) return null;

  const handleDismiss = () => {
    if (!current.is_read) markRead.mutate(current.id);
    if (tappedId) clearTapped();
  };

  const d    = current.created_at ? new Date(current.created_at) : null;
  const date = d?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={popupStyles.overlay}>
        <View style={[popupStyles.card, { backgroundColor: C.card }]}>
          <View style={[popupStyles.iconWrap, { backgroundColor: C.primaryLight }]}>
            <Text style={{ fontSize: 28 }}>🔔</Text>
          </View>
          <View style={[popupStyles.badge, { backgroundColor: C.primary }]}>
            <Text style={[popupStyles.badgeText, { fontFamily: Font.bold }]}>New Notification</Text>
          </View>
          {!tappedId && unread.length > 1 && (
            <Text style={[popupStyles.countText, { color: C.textSubtle, fontFamily: Font.regular }]}>
              {unread.length - 1} more after this
            </Text>
          )}
          <Text style={[popupStyles.title, { color: C.text, fontFamily: Font.bold }]}>
            {current.title}
          </Text>
          <Text style={[popupStyles.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            {current.body}
          </Text>
          {d && (
            <Text style={[popupStyles.dateTime, { color: C.textSubtle, fontFamily: Font.regular }]}>
              {date}  •  {time}
            </Text>
          )}
          <TouchableOpacity
            style={[popupStyles.btn, { backgroundColor: C.primary }]}
            onPress={handleDismiss}
            activeOpacity={0.85}
          >
            <Text style={[popupStyles.btnText, { fontFamily: Font.bold }]}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Restore Cloud Data Modal ───────────────────────────────────────────────────
//
// Shown once per device install when local DB is empty but cloud has books.
// User chooses "Restore" (pulls cloud → local) or "Start Fresh" (skips sync).

function RestoreCloudModal() {
  const user             = useAuthStore(s => s.user);
  const { C }            = useTheme();
  const visible          = useSyncStore(s => s.showRestorePrompt);
  const setRestorePrompt = useSyncStore(s => s.setRestorePrompt);
  const startSync        = useSyncStore(s => s.startSync);
  const setProgress      = useSyncStore(s => s.setProgress);
  const finishSync       = useSyncStore(s => s.finishSync);
  const failSync         = useSyncStore(s => s.failSync);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const PULL_FLAG = `cashbook_initial_pull_done_${user?.id}`;

  const dismiss = () => {
    setRestorePrompt(false);
    SecureStore.setItemAsync(PULL_FLAG, '1').catch(() => {});
  };

  const handleRestore = async () => {
    setLoading(true);
    startSync();
    setRestorePrompt(false);

    try {
      const result = await syncCloudToLocal((done, total, step) => setProgress(done, total, step));
      finishSync(new Date().toISOString());
      SecureStore.setItemAsync(PULL_FLAG, '1').catch(() => {});
      Toast.show({
        type: 'success',
        text1: 'Data restored!',
        text2: `${result.synced} item${result.synced !== 1 ? 's' : ''} downloaded from cloud`,
        visibilityTime: 4000,
      });
    } catch (err) {
      failSync(err?.message ?? 'Restore failed');
      Toast.show({
        type: 'error',
        text1: 'Restore failed',
        text2: 'You can retry from Backup & Sync in Settings',
        visibilityTime: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartFresh = () => {
    dismiss();
    Toast.show({
      type: 'info',
      text1: 'Starting fresh',
      text2: 'Your cloud data is safe and can be restored anytime from Settings',
      visibilityTime: 3500,
    });
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={restoreStyles.overlay}>
        <View style={[restoreStyles.card, { backgroundColor: C.card }]}>
          <View style={[restoreStyles.iconWrap, { backgroundColor: C.primaryLight }]}>
            <Text style={{ fontSize: 30 }}>☁️</Text>
          </View>

          <Text style={[restoreStyles.title, { color: C.text, fontFamily: Font.bold }]}>
            Cloud Data Found
          </Text>
          <Text style={[restoreStyles.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            We found your backed-up data in the cloud. Would you like to restore it to this device?
          </Text>
          <Text style={[restoreStyles.hint, { color: C.textSubtle, fontFamily: Font.regular }]}>
            New entries will continue to sync automatically.
          </Text>

          <TouchableOpacity
            style={[restoreStyles.btnPrimary, { backgroundColor: C.primary }, loading && restoreStyles.btnDisabled]}
            onPress={handleRestore}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Text style={[restoreStyles.btnPrimaryText, { fontFamily: Font.bold }]}>
              {loading ? 'Restoring…' : 'Restore Cloud Data'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[restoreStyles.btnSecondary, { borderColor: C.border }]}
            onPress={handleStartFresh}
            activeOpacity={0.75}
            disabled={loading}
          >
            <Text style={[restoreStyles.btnSecondaryText, { color: C.textMuted, fontFamily: Font.medium }]}>
              Start Fresh
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const restoreStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%', borderRadius: 24, padding: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 16,
  },
  iconWrap:          { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:             { fontSize: 20, textAlign: 'center', marginBottom: 10 },
  body:              { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  hint:              { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 28 },
  btnPrimary:        { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  btnPrimaryText:    { fontSize: 15, color: '#fff' },
  btnSecondary:      { width: '100%', paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
  btnSecondaryText:  { fontSize: 14 },
  btnDisabled:       { opacity: 0.6 },
});

// ──────────────────────────────────────────────────────────────────────────────

const popupStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%', borderRadius: 24, padding: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 16,
  },
  iconWrap:  { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  badge:     { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginBottom: 8 },
  badgeText: { fontSize: 12, color: '#fff' },
  countText: { fontSize: 12, marginBottom: 14 },
  title:     { fontSize: 18, textAlign: 'center', marginBottom: 10, lineHeight: 26 },
  body:      { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn:       { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText:   { fontSize: 15, color: '#fff' },
  dateTime:  { fontSize: 12, marginBottom: 20, textAlign: 'center' },
});

// ──────────────────────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== 'web') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null;

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkMonitor />
      <InitialPullMonitor />
      <SupabaseAuthListener />
      <AuthGuard />
      <Slot />
      <RestoreCloudModal />
      <NotificationPopup />
      <Toast config={toastConfig} />
    </QueryClientProvider>
  );
}
