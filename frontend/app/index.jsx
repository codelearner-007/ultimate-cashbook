import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Animated, Dimensions, Image,
} from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../src/store/authStore';
import { useSyncStore } from '../src/store/syncStore';
import { canAccess } from '../src/lib/canAccess';
import { getLocalStats, getCloudDeltaStats, syncCloudToLocal } from '../src/lib/syncManager';
import Toast from '../src/lib/toast';
import RestoreOrFreshSheet from '../src/components/ui/RestoreOrFreshSheet';

const { width, height } = Dimensions.get('window');

const BG      = '#EEF7F7';
const PRIMARY = '#39AAAA';
const TEXT_MUTED = '#64748B';

// Minimal static theme for pre-auth screens (no useTheme hook here)
const C = {
  primary: '#39AAAA', primaryLight: '#E0F5F5',
  text: '#0F172A', textMuted: '#64748B',
  card: '#FFFFFF', border: '#E2E8F0', background: '#F8FAFC',
  danger: '#B91C1C', dangerLight: '#FEE2E2',
};
const Font = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold', bold: 'Inter_700Bold', extraBold: 'Inter_800ExtraBold',
};

function BackgroundBlobs() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Ellipse cx={width * 0.92} cy={height * 0.06} rx={140} ry={130} fill="rgba(57,170,170,0.14)" />
      <Ellipse cx={0} cy={height * 0.36} rx={100} ry={95} fill="rgba(57,170,170,0.10)" />
      <Ellipse cx={-30} cy={height + 30} rx={160} ry={150} fill="rgba(57,170,170,0.55)" />
      <Ellipse cx={width + 20} cy={height - 20} rx={120} ry={115} fill="rgba(57,170,170,0.35)" />
    </Svg>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Index() {
  const router = useRouter();
  const qc     = useQueryClient();
  const user   = useAuthStore((s) => s.user);

  const {
    restoreProgress,
    startRestore, setRestoreProgress, finishRestore, failRestore,
    setHasRestored, setRestoreJustCompleted,
  } = useSyncStore();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const [showRestoreSheet, setShowRestoreSheet] = useState(false);
  const [cloudBookCount,   setCloudBookCount]   = useState(0);
  const [navigateTarget,   setNavigateTarget]   = useState(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After splash, decide where to go
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      const target = user.role === 'superadmin'
        ? '/(app)/dashboard/users'
        : '/(app)/books';

      // Check for cloud restore prompt (paid users / superadmin only)
      const userCanSync = canAccess(user, 'cloud_sync');
      if (userCanSync) {
        try {
          const [localStats, delta] = await Promise.all([
            getLocalStats(),
            getCloudDeltaStats(),
          ]);
          // Show prompt only when: local is empty AND cloud has books
          if (localStats.books === 0 && delta.hasCloudData) {
            setCloudBookCount(delta.newBooks > 0 ? delta.newBooks : 1);
            setNavigateTarget(target);
            setShowRestoreSheet(true);
            return;
          }
        } catch {
          // Offline or error — just navigate normally
        }
      }

      router.replace(target);
    }, 1800);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore: download cloud → local, stay on this screen (with overlay) until done
  const doRestore = useCallback(async () => {
    setShowRestoreSheet(false);
    startRestore();
    try {
      const result = await syncCloudToLocal((done, total, step) => {
        setRestoreProgress(done, total, step);
      });
      // Seed the delta cursor so later incremental pulls only fetch new changes.
      if (result?.server_time) useSyncStore.getState().setSyncCursor(result.server_time);
      finishRestore();
      setHasRestored(true);             // hide restore button in Backup & Sync — data is now local
      setRestoreJustCompleted(true);    // keep overlay until BooksView confirms books are rendered
      qc.invalidateQueries();
      const msg = result.synced > 0
        ? `${result.synced} item(s) restored to your device.`
        : 'All data is already up to date.';
      Toast.show({ type: 'success', text1: 'Restore Complete', text2: msg });
    } catch (err) {
      failRestore(err?.message ?? 'Restore failed. Please try again.');
      Toast.show({ type: 'error', text1: 'Restore Failed', text2: 'Could not download cloud data.' });
    } finally {
      if (navigateTarget) router.replace(navigateTarget);
    }
  }, [startRestore, setRestoreProgress, finishRestore, failRestore, setHasRestored, setRestoreJustCompleted, qc, navigateTarget, router]);

  const handleLater = useCallback(() => {
    setShowRestoreSheet(false);
    if (navigateTarget) router.replace(navigateTarget);
  }, [navigateTarget, router]);

  return (
    <View style={s.root}>
      <BackgroundBlobs />

      {/* Splash content */}
      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={s.logoBorder}>
          <View style={s.logoCircle}>
            <Image
              source={require('../assets/logo1.jpg')}
              style={s.logoImage}
              resizeMode="cover"
            />
          </View>
        </View>
        <Text style={s.appName}>Ultimate CashBook</Text>
        <Text style={s.tagline}>Smart money tracking for your business</Text>
      </Animated.View>

      {/* Restore-or-Later bottom sheet */}
      <RestoreOrFreshSheet
        visible={showRestoreSheet}
        onRestore={doRestore}
        onLater={handleLater}
        isLoading={false}
        progress={restoreProgress}
        cloudBookCount={cloudBookCount}
        C={C}
        Font={Font}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
  },
  content: {
    alignItems: 'center', paddingHorizontal: 32,
  },
  logoBorder: {
    width: 122, height: 122, borderRadius: 61,
    borderWidth: 3, borderColor: 'rgba(57,170,170,0.30)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20, shadowRadius: 12, elevation: 8,
  },
  logoImage: { width: '100%', height: '100%' },
  appName: {
    fontSize: 26, fontWeight: '800', color: PRIMARY,
    letterSpacing: 0.3, marginBottom: 6, textAlign: 'center',
  },
  tagline: {
    fontSize: 14, color: TEXT_MUTED,
    textAlign: 'center', letterSpacing: 0.1, marginBottom: 40,
  },

});
