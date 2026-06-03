import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, Animated, Dimensions, Image, ActivityIndicator,
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

// ── Restore overlay — shown full-screen during cloud → local download ─────────

function RestoreOverlay({ isRestoring, progress }) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dotScale       = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: isRestoring ? 1 : 0, duration: 300, useNativeDriver: true,
    }).start();
  }, [isRestoring, overlayOpacity]);

  useEffect(() => {
    if (!isRestoring) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(dotScale, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(dotScale, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRestoring, dotScale]);

  if (!isRestoring) return null;

  const pct   = progress?.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const pcInt = Math.round(pct * 100);

  return (
    <Animated.View style={[s.restoreOverlay, { opacity: overlayOpacity }]}>
      <BackgroundBlobs />

      {/* Animated cloud icon */}
      <Animated.View style={[s.restoreIconWrap, { transform: [{ scale: dotScale }] }]}>
        <View style={s.restoreIconCircle}>
          <Text style={s.restoreIconEmoji}>☁️</Text>
        </View>
      </Animated.View>

      <Text style={s.restoreTitle}>Restoring your data</Text>
      <Text style={s.restoreSub}>
        {progress?.step || 'Connecting to cloud…'}
      </Text>

      {/* Progress bar */}
      <View style={s.restoreTrackWrap}>
        <View style={s.restoreTrack}>
          <Animated.View style={[s.restoreTrackFill, { width: `${pcInt}%` }]} />
        </View>
        <Text style={s.restorePct}>{pcInt}%</Text>
      </View>

      {progress?.total > 0 && (
        <Text style={s.restoreCountLabel}>
          {progress.done} / {progress.total} items
        </Text>
      )}

      <ActivityIndicator size="small" color={PRIMARY} style={{ marginTop: 20 }} />

      <Text style={s.restoreNote}>
        Please keep the app open until restore is complete.
      </Text>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Index() {
  const router = useRouter();
  const qc     = useQueryClient();
  const user   = useAuthStore((s) => s.user);

  const {
    isRestoring, restoreProgress,
    startRestore, setRestoreProgress, finishRestore, failRestore,
    setHasRestored,
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
      finishRestore();
      setHasRestored(true);   // hide restore button in Backup & Sync — data is now local
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
  }, [startRestore, setRestoreProgress, finishRestore, failRestore, setHasRestored, qc, navigateTarget, router]);

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

      {/* Full-screen restore overlay (persists until sync complete) */}
      <RestoreOverlay isRestoring={isRestoring} progress={restoreProgress} />

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

  // Restore overlay
  restoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  restoreIconWrap: { marginBottom: 28 },
  restoreIconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(57,170,170,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  restoreIconEmoji: { fontSize: 44 },
  restoreTitle: {
    fontSize: 22, fontWeight: '700', color: PRIMARY,
    marginBottom: 8, textAlign: 'center',
  },
  restoreSub: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center', marginBottom: 28,
  },
  restoreTrackWrap: { width: '100%', marginBottom: 6 },
  restoreTrack: {
    height: 8, borderRadius: 4,
    backgroundColor: 'rgba(57,170,170,0.18)', overflow: 'hidden', marginBottom: 6,
  },
  restoreTrackFill: {
    height: 8, borderRadius: 4, backgroundColor: PRIMARY,
  },
  restorePct: {
    fontSize: 13, color: PRIMARY, fontWeight: '600', textAlign: 'right',
  },
  restoreCountLabel: {
    fontSize: 12, color: TEXT_MUTED, textAlign: 'center', marginTop: 2,
  },
  restoreNote: {
    fontSize: 12, color: TEXT_MUTED, textAlign: 'center',
    marginTop: 14, lineHeight: 18,
  },
});
