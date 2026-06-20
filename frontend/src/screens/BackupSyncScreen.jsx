import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Alert, Animated, Modal, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Network from 'expo-network';
import { Feather } from '@expo/vector-icons';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { Font } from '../constants/fonts';
import {
  getLocalStats, syncLocalToCloud, syncCloudToLocal, getCloudDeltaStats,
} from '../lib/syncManager';
import { localClearAll } from '../lib/localDb';
import { apiGetBooks, apiDeleteBook } from '../lib/api';
import { canAccess, getLimit } from '../lib/canAccess';
import Toast from '../lib/toast';
import SyncConfirmSheet from '../components/ui/SyncConfirmSheet';
import RestoreOrFreshSheet from '../components/ui/RestoreOrFreshSheet';
import FreshStartSheet from '../components/ui/FreshStartSheet';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtDeadline(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// Returns { days, hours, minutes, seconds, expired } from an ISO timestamp
function calcTimeLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days:    Math.floor(ms / 86400000),
    hours:   Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
    expired: false,
  };
}

// ── Countdown tile — digital clock style ─────────────────────────────────────

function CountTile({ value, label, C }) {
  return (
    <View style={{ alignItems: 'center' }}>
      {/* Digital display box */}
      <View style={{
        backgroundColor: C.danger + '15',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: C.danger + '60',
        paddingHorizontal: 14,
        paddingVertical: 10,
        minWidth: 58,
        alignItems: 'center',
        // Subtle inner glow
        shadowColor: C.danger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
      }}>
        {/* Ghost digits behind for depth */}
        <Text style={{
          position: 'absolute',
          fontSize: 30,
          color: C.danger + '18',
          fontFamily: Font.extraBold,
          letterSpacing: 2,
        }}>
          88
        </Text>
        <Text style={{
          fontSize: 30,
          color: C.danger,
          fontFamily: Font.extraBold,
          letterSpacing: 2,
          lineHeight: 36,
        }}>
          {String(value).padStart(2, '0')}
        </Text>
      </View>
      <Text style={{
        fontSize: 9,
        color: C.danger + 'BB',
        fontFamily: Font.semiBold,
        marginTop: 6,
        letterSpacing: 1.5,
      }}>
        {label}
      </Text>
    </View>
  );
}

// Flashing colon separator
function ColonSep({ C }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.Text style={{
      fontSize: 28, color: C.danger, fontFamily: Font.extraBold,
      opacity, marginBottom: 16, lineHeight: 36,
    }}>
      :
    </Animated.Text>
  );
}

// ── Lapse overlay — blurs content and shows countdown ─────────────────────────

function LapseOverlay({ cloudDataDeleteAt, backupDays, C, onRenew }) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(cloudDataDeleteAt));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft(cloudDataDeleteAt)), 1000);
    return () => clearInterval(id);
  }, [cloudDataDeleteAt]);

  if (!timeLeft) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Blur backdrop */}
      <View style={[StyleSheet.absoluteFillObject, {
        backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.72)',
      }]} pointerEvents="auto" />

      {/* Centered card */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{
          backgroundColor: C.card, borderRadius: 24, borderWidth: 1.5,
          borderColor: C.danger + '55', padding: 28, alignItems: 'center', width: '100%',
          shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.25, shadowRadius: 32, elevation: 20,
        }}>
          {/* Icon */}
          <View style={{
            width: 64, height: 64, borderRadius: 20, backgroundColor: C.danger + '18',
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            borderWidth: 1.5, borderColor: C.danger + '44',
          }}>
            <Feather name="cloud-off" size={28} color={C.danger} />
          </View>

          <Text style={{ fontSize: 18, color: C.text, fontFamily: Font.bold, marginBottom: 6, textAlign: 'center' }}>
            Subscription Ended
          </Text>
          <Text style={{ fontSize: 13, color: C.textMuted, fontFamily: Font.regular, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
            {timeLeft.expired
              ? 'Your cloud data has been permanently deleted.'
              : `Your cloud data is kept for ${backupDays} days after your plan ended. Renew before the deadline to restore access.`}
          </Text>

          {/* Digital countdown clock */}
          {!timeLeft.expired && (
            <>
              {/* Label strip */}
              <View style={{
                backgroundColor: C.danger + '15', borderRadius: 8,
                paddingHorizontal: 14, paddingVertical: 5, marginBottom: 20,
              }}>
                <Text style={{ fontSize: 10, color: C.danger, fontFamily: Font.semiBold, letterSpacing: 2 }}>
                  CLOUD DATA DELETED IN
                </Text>
              </View>

              {/* Clock row */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16,
              }}>
                <CountTile value={timeLeft.days}    label="DAYS" C={C} />
                <ColonSep C={C} />
                <CountTile value={timeLeft.hours}   label="HRS"  C={C} />
                <ColonSep C={C} />
                <CountTile value={timeLeft.minutes} label="MIN"  C={C} />
                <ColonSep C={C} />
                <CountTile value={timeLeft.seconds} label="SEC"  C={C} />
              </View>

              {/* Deadline timestamp */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: C.danger + '10', borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 7, marginBottom: 24,
              }}>
                <Feather name="calendar" size={12} color={C.danger + 'AA'} />
                <Text style={{ fontSize: 11, color: C.danger + 'BB', fontFamily: Font.medium }}>
                  {fmtDeadline(cloudDataDeleteAt)}
                </Text>
              </View>
            </>
          )}

          {timeLeft.expired && (
            <View style={{ marginBottom: 24 }} />
          )}

          {/* Renew button */}
          {!timeLeft.expired && (
            <TouchableOpacity
              onPress={onRenew}
              style={{
                backgroundColor: C.danger, borderRadius: 14, paddingVertical: 14,
                width: '100%', alignItems: 'center', marginBottom: 10,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 15, color: '#fff', fontFamily: Font.bold }}>
                Renew Plan to Keep Data
              </Text>
            </TouchableOpacity>
          )}

          <Text style={{ fontSize: 11, color: C.textMuted, fontFamily: Font.regular, textAlign: 'center', lineHeight: 17 }}>
            {timeLeft.expired
              ? 'Subscribe again to start fresh cloud backups.'
              : 'Your local data on this device is safe regardless of your subscription.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── StatRow ───────────────────────────────────────────────────────────────────

function StatRow({ icon, label, value, C }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 }}>
      <View style={[{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, { backgroundColor: C.primaryLight }]}>
        <Feather name={icon} size={15} color={C.primary} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, color: C.text, fontFamily: Font.medium }}>{label}</Text>
      <Text style={{ fontSize: 14, color: C.primary, fontFamily: Font.bold }}>{value}</Text>
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ done, total, step, accentColor }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: accentColor + '22', overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
      </View>
      <Text style={{ fontSize: 12, color: accentColor, fontFamily: Font.regular, marginTop: 6 }}>
        {step || 'Preparing…'}  {total > 0 ? `(${done}/${total})` : ''}
      </Text>
    </View>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

const abStyles = StyleSheet.create({
  btn:   {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14,
  },
  icon:  { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, lineHeight: 20 },
  sub:   { fontSize: 11, lineHeight: 16, marginTop: 1 },
});

function ActionBtn({ icon, label, sublabel, onPress, variant, disabled, C }) {
  const isDestructive = variant === 'danger';
  const isSecondary   = variant === 'secondary';

  const bg = disabled
    ? C.border
    : isDestructive ? C.dangerLight : isSecondary ? C.primaryLight : C.primary;
  const border = isDestructive
    ? C.danger + '66' : isSecondary ? C.primary + '55' : 'transparent';
  const textColor = disabled
    ? C.textMuted
    : isDestructive ? C.danger : isSecondary ? C.primary : '#fff';

  return (
    <TouchableOpacity
      style={[abStyles.btn, { backgroundColor: bg, borderColor: border, borderWidth: 1.5, opacity: disabled ? 0.6 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <View style={[abStyles.icon, {
        backgroundColor: isDestructive
          ? C.danger + '22'
          : isSecondary ? C.primary + '22'
          : 'rgba(255,255,255,0.20)',
      }]}>
        <Feather name={icon} size={17} color={textColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[abStyles.label, { color: textColor, fontFamily: Font.bold }]}>{label}</Text>
        {sublabel ? (
          <Text style={[abStyles.sub, { color: isDestructive || isSecondary ? textColor + 'AA' : '#fff', fontFamily: Font.regular }]}>{sublabel}</Text>
        ) : null}
      </View>
      {!disabled && (
        <Feather name="chevron-right" size={16} color={textColor} />
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BackupSyncScreen() {
  const router  = useRouter();
  const { C, Font, isDark } = useTheme();
  const qc      = useQueryClient();
  const st      = makeStyles(C);

  const user    = useAuthStore(s => s.user);
  const {
    isOnline, isSyncing, lastSyncedAt, syncError,
    startSync, setProgress, finishSync, failSync,
    isRestoring, restoreError,
    startRestore, setRestoreProgress, finishRestore, failRestore,
    hasRestoredFromCloud, setHasRestored,
  } = useSyncStore();
  const progress        = useSyncStore(s => s.progress)        ?? { done: 0, total: 0, step: '' };
  const restoreProgress = useSyncStore(s => s.restoreProgress) ?? { done: 0, total: 0, step: '' };
  const canSync = canAccess(user, 'cloud_sync');

  // Subscription state
  const subscriptionStatus = user?.subscription_status  ?? 'free';
  const subscriptionTier   = user?.subscription_tier    ?? 'free';
  const cloudDataDeleteAt  = user?.cloud_data_delete_at ?? null;
  const isSuperAdmin       = user?.role === 'superadmin';
  // User whose subscription has lapsed — grace period countdown shown
  const isLapsed           = (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') && !!cloudDataDeleteAt;
  const hadPaidPlan        = isSuperAdmin || subscriptionTier !== 'free' || isLapsed;
  const backupDays         = hadPaidPlan ? (isSuperAdmin ? 15 : getLimit(user, 'backup_days')) : 0;

  const [stats,              setStats]              = useState(null);
  const [statsLoading,       setStatsLoading]       = useState(true);
  const [netState,           setNetState]           = useState(null);
  const [delta,              setDelta]              = useState(null);
  const [deltaLoading,       setDeltaLoading]       = useState(true);
  const [cloudBookCount,     setCloudBookCount]     = useState(0);

  const [showSyncConfirm,    setShowSyncConfirm]    = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showFreshStart,     setShowFreshStart]     = useState(false);
  const [isFreshStarting,    setIsFreshStarting]    = useState(false);
  const [freshStartStatus,   setFreshStartStatus]   = useState('');
  const [showEmptyAlert,     setShowEmptyAlert]     = useState(false);

  const dotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isOnline) { dotOpacity.setValue(1); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.15, duration: 800, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isOnline]);

  const loadData = useCallback(async () => {
    const [s, net, d] = await Promise.all([
      getLocalStats(),
      Network.getNetworkStateAsync().catch(() => null),
      getCloudDeltaStats(),
    ]);
    setStats(s);
    setNetState(net);
    setStatsLoading(false);
    setDelta(d);
    setDeltaLoading(false);
    try {
      const cloudBooks = await apiGetBooks();
      setCloudBookCount(cloudBooks.length);
    } catch {
      setCloudBookCount(d.hasCloudData ? 1 : 0);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, net, d] = await Promise.all([
        getLocalStats(),
        Network.getNetworkStateAsync().catch(() => null),
        getCloudDeltaStats(),
      ]);
      if (!mounted) return;
      setStats(s);
      setNetState(net);
      setStatsLoading(false);
      setDelta(d);
      setDeltaLoading(false);
      try {
        const cloudBooks = await apiGetBooks();
        if (mounted) setCloudBookCount(cloudBooks.length);
      } catch {
        if (mounted) setCloudBookCount(d.hasCloudData ? 1 : 0);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const isAlreadySynced = !deltaLoading && delta !== null && delta.toUpload === 0 && (stats?.total ?? 0) > 0;
  const hasCloudData    = delta?.hasCloudData ?? false;
  const hasUnrestoredCloudData = !deltaLoading && hasCloudData &&
    ((delta?.onlyInCloudEntries ?? 0) > 0 || (delta?.newBooks ?? 0) > 0);

  const handleSync = useCallback(() => {
    if (isSyncing) return;
    if (isAlreadySynced) { Toast.show({ type: 'success', text1: 'Already synced', text2: 'All local data is up to date in the cloud.' }); return; }
    if (!isOnline) { Alert.alert('No connection', 'Please connect to the internet to sync your data.'); return; }
    if (!canSync)  { Alert.alert('Pro feature', 'Cloud backup & sync requires a Pro or Business plan.'); return; }
    if (!stats || stats.total === 0) { setShowEmptyAlert(true); return; }
    setShowSyncConfirm(true);
  }, [isSyncing, isAlreadySynced, isOnline, canSync, stats]);

  const doSync = useCallback(async () => {
    startSync();
    try {
      const result = await syncLocalToCloud((done, total, step) => setProgress(done, total, step));
      finishSync(new Date().toISOString());
      setShowSyncConfirm(false);
      qc.invalidateQueries();
      await loadData();
      const msg = result.synced === 0 && result.alreadySynced > 0
        ? 'Everything is already synced to cloud.'
        : result.synced > 0 && result.alreadySynced > 0
          ? `${result.synced} new item(s) uploaded. ${result.alreadySynced} already synced.`
          : `${result.synced} item(s) uploaded to cloud.`;
      Toast.show({ type: 'success', text1: 'Data Synced', text2: msg });
    } catch (err) {
      setShowSyncConfirm(false);
      failSync(err?.message ?? 'Sync failed. Please try again.');
    }
  }, [startSync, setProgress, finishSync, failSync, qc, loadData]);

  const handleRestore = useCallback(() => {
    if (!isOnline) { Alert.alert('No connection', 'Please connect to the internet to restore your data.'); return; }
    if (!hasCloudData) { Alert.alert('No cloud data', 'No books found in your cloud account.'); return; }
    setShowRestoreConfirm(true);
  }, [isOnline, hasCloudData]);

  const doRestore = useCallback(async () => {
    startRestore();
    try {
      const result = await syncCloudToLocal((done, total, step) => setRestoreProgress(done, total, step));
      finishRestore();
      setHasRestored(true);
      setShowRestoreConfirm(false);
      qc.invalidateQueries();
      await loadData();
      const msg = result.synced > 0
        ? `${result.synced} item(s) restored to your device.`
        : 'All data is already up to date.';
      Toast.show({ type: 'success', text1: 'Restore Complete', text2: msg });
    } catch (err) {
      failRestore(err?.message ?? 'Restore failed. Please try again.');
      setShowRestoreConfirm(false);
    }
  }, [startRestore, setRestoreProgress, finishRestore, failRestore, setHasRestored, qc, loadData]);

  const doFreshStart = useCallback(async () => {
    setIsFreshStarting(true);
    setFreshStartStatus('Fetching cloud books…');
    try {
      let cloudBooks = [];
      try { cloudBooks = await apiGetBooks(); } catch { cloudBooks = []; }
      for (let i = 0; i < cloudBooks.length; i++) {
        setFreshStartStatus(`Deleting book ${i + 1} of ${cloudBooks.length}…`);
        await apiDeleteBook(cloudBooks[i].id);
      }
      setFreshStartStatus('Clearing local data…');
      await localClearAll();
      setHasRestored(true);
      qc.invalidateQueries();
      await loadData();
      setShowFreshStart(false);
      setFreshStartStatus('');
      Toast.show({ type: 'success', text1: 'Fresh Start', text2: 'All data has been erased.' });
    } catch (err) {
      setFreshStartStatus('');
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message ?? 'Could not complete fresh start.' });
    } finally {
      setIsFreshStarting(false);
    }
  }, [setHasRestored, qc, loadData]);

  const lastSyncLabel = fmtDate(lastSyncedAt);

  return (
    <SafeAreaView applyTop style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/settings')}
          style={st.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Backup & Sync</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Content (always rendered; blurred behind overlay when lapsed) ── */}
      <View style={{ flex: 1 }}>
        <ScrollView
          style={st.scroll}
          contentContainerStyle={st.content}
          showsVerticalScrollIndicator={false}
          // Disable scroll interaction when lapsed overlay is showing
          scrollEnabled={!isLapsed}
          pointerEvents={isLapsed ? 'none' : 'auto'}
        >

          {/* ── Status card ── */}
          <View style={[st.card, { borderColor: isOnline ? C.cashIn + '66' : C.danger + '66' }]}>
            <View style={st.statusRow}>
              <Animated.View style={[st.statusDot, { backgroundColor: isOnline ? C.cashIn : C.danger, opacity: dotOpacity }]} />
              <Text style={[st.statusText, { color: C.text, fontFamily: Font.semiBold }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
              {netState?.type && (
                <Text style={[st.statusSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                  {'  ·  '}{netState.type}
                </Text>
              )}
            </View>
            <View style={[st.statusDivider, { backgroundColor: C.border }]} />
            <View style={st.syncMeta}>
              <Feather name="clock" size={13} color={C.textMuted} />
              <Text style={[st.syncMetaText, { color: C.textMuted, fontFamily: Font.regular }]}>
                {lastSyncLabel ? `Last synced: ${lastSyncLabel}` : 'Never synced'}
              </Text>
            </View>
            {syncError && (
              <Text style={[st.errorText, { color: C.danger, fontFamily: Font.regular }]}>⚠ {syncError}</Text>
            )}
            {isSyncing && (
              <View style={{ marginTop: 10 }}>
                <ProgressBar done={progress?.done ?? 0} total={progress?.total ?? 0} step={progress?.step ?? ''} accentColor={C.primary} />
              </View>
            )}
            {isRestoring && (
              <View style={{ marginTop: 10 }}>
                <ProgressBar done={restoreProgress?.done ?? 0} total={restoreProgress?.total ?? 0} step={restoreProgress?.step ?? ''} accentColor={C.cashIn} />
              </View>
            )}
            {restoreError && (
              <Text style={[st.errorText, { color: C.danger, fontFamily: Font.regular }]}>⚠ {restoreError}</Text>
            )}
          </View>

          {/* ── Local data card ── */}
          <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>LOCAL DATA</Text>
          <View style={[st.card, { padding: 0, overflow: 'hidden' }]}>
            {statsLoading ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: C.textMuted, fontFamily: Font.regular, fontSize: 13 }}>Loading…</Text>
              </View>
            ) : (
              <>
                {[
                  { icon: 'book',  label: 'Cashbooks',  value: stats?.books      ?? 0 },
                  { icon: 'list',  label: 'Entries',    value: stats?.entries    ?? 0 },
                  { icon: 'tag',   label: 'Categories', value: stats?.categories ?? 0 },
                  { icon: 'users', label: 'Customers',  value: stats?.customers  ?? 0 },
                  { icon: 'truck', label: 'Suppliers',  value: stats?.suppliers  ?? 0 },
                ].map((row, i, arr) => (
                  <View key={row.label}>
                    <StatRow icon={row.icon} label={row.label} value={row.value} C={C} />
                    {i < arr.length - 1 && <View style={[st.rowDivider, { backgroundColor: C.border }]} />}
                  </View>
                ))}
              </>
            )}
          </View>

          {/* ── Backup Data (active paid / superadmin only) ── */}
          {hadPaidPlan && !isLapsed && backupDays > 0 && (
            <>
              <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 24 }]}>
                BACKUP DATA
              </Text>
              <View style={[st.card, { padding: 0, overflow: 'hidden' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryLight }}>
                    <Feather name="archive" size={17} color={C.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: C.text, fontFamily: Font.semiBold }}>
                      {backupDays}-Day Backup Retention
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textMuted, fontFamily: Font.regular, marginTop: 2 }}>
                      {`Cloud backups from the last ${backupDays} days are stored and restorable.`}
                    </Text>
                  </View>
                </View>
                <View style={[st.rowDivider, { backgroundColor: C.border }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryLight }}>
                    <Feather name="clock" size={15} color={C.primary} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: C.textMuted, fontFamily: Font.regular }}>
                    {lastSyncLabel ? `Last backup: ${lastSyncLabel}` : 'No backup recorded yet'}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ── Pro gate ── */}
          {!canSync ? (
            <View style={[st.gateCard, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B44' }]}>
              <Text style={{ fontSize: 28, marginBottom: 10 }}>👑</Text>
              <Text style={[st.gateTitle, { color: C.text, fontFamily: Font.bold }]}>Pro Feature</Text>
              <Text style={[st.gateSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                Cloud backup & sync requires a Pro or Business subscription. Your data is safe locally.
              </Text>
              <TouchableOpacity
                style={[st.gateBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => router.push('/(app)/settings/subscription')}
                activeOpacity={0.85}
              >
                <Text style={[st.gateBtnText, { fontFamily: Font.bold }]}>View Plans 👑</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Cloud actions ── */}
              <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 24 }]}>
                CLOUD ACTIONS
              </Text>
              <View style={st.actionsCol}>
                <ActionBtn
                  icon={isSyncing ? 'loader' : isAlreadySynced ? 'check-circle' : 'upload-cloud'}
                  label={isSyncing ? 'Syncing…' : isAlreadySynced ? 'All Data Synced' : 'Sync to Cloud'}
                  sublabel={!isOnline ? 'No internet connection' : isAlreadySynced ? 'Local and cloud are in sync' : 'Tap to sync now — auto-syncs every 5 min'}
                  onPress={handleSync}
                  variant="primary"
                  disabled={!isOnline || isSyncing || isRestoring}
                  C={C}
                />
                {!hasRestoredFromCloud && hasUnrestoredCloudData && (
                  <ActionBtn
                    icon={isRestoring ? 'loader' : 'download-cloud'}
                    label={isRestoring ? 'Restoring…' : 'Restore from Cloud'}
                    sublabel={!isOnline ? 'No internet connection' : `${cloudBookCount} book${cloudBookCount !== 1 ? 's' : ''} available in cloud`}
                    onPress={handleRestore}
                    variant="secondary"
                    disabled={!isOnline || isRestoring || isSyncing}
                    C={C}
                  />
                )}
              </View>

              {/* ── Danger zone ── */}
              <Text style={[st.sectionLabel, { color: C.danger + 'AA', fontFamily: Font.semiBold, marginTop: 28 }]}>
                DANGER ZONE
              </Text>
              <View style={[st.dangerCard, { backgroundColor: C.dangerLight, borderColor: C.danger + '44' }]}>
                <View style={st.dangerHeader}>
                  <View style={[st.dangerIconWrap, { backgroundColor: C.danger + '22' }]}>
                    <Feather name="alert-triangle" size={16} color={C.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.dangerTitle, { color: C.danger, fontFamily: Font.bold }]}>Start Fresh</Text>
                    <Text style={[st.dangerSub, { color: C.danger + 'BB', fontFamily: Font.regular }]}>
                      Deletes all data from cloud and device permanently
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[st.dangerBtn, {
                    backgroundColor: (!isOnline || isFreshStarting || isSyncing || isRestoring) ? C.border : C.danger,
                    opacity: (!isOnline || isFreshStarting || isSyncing || isRestoring) ? 0.6 : 1,
                  }]}
                  onPress={() => { if (!isOnline) return; setShowFreshStart(true); }}
                  disabled={!isOnline || isFreshStarting || isSyncing || isRestoring}
                  activeOpacity={0.85}
                >
                  <Feather name="trash-2" size={15} color={!isOnline ? C.textMuted : '#fff'} />
                  <Text style={[st.dangerBtnText, { fontFamily: Font.bold, color: !isOnline ? C.textMuted : '#fff' }]}>
                    {isOnline ? 'Start Fresh' : 'Start Fresh (offline)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Info note ── */}
          <View style={[st.infoBox, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
            <Feather name="info" size={14} color={C.primary} />
            <Text style={[st.infoText, { color: C.primary, fontFamily: Font.regular }]}>
              {canSync
                ? 'Data auto-syncs to cloud every 5 minutes and on reconnect. Use the Sync button if something seems out of date.'
                : 'Free plan stores data on this device only. Uninstalling the app will delete all data.'
              }
            </Text>
          </View>

        </ScrollView>

        {/* ── Lapse overlay — renders above scroll content, only for lapsed users ── */}
        {isLapsed && (
          <LapseOverlay
            cloudDataDeleteAt={cloudDataDeleteAt}
            backupDays={backupDays}
            C={C}
            onRenew={() => router.push('/(app)/settings/subscription')}
          />
        )}
      </View>

      {/* ── Sheets ── */}
      <SyncConfirmSheet
        visible={showSyncConfirm}
        onDismiss={() => setShowSyncConfirm(false)}
        onConfirm={doSync}
        isLoading={isSyncing}
        stats={stats}
        C={C}
        Font={Font}
      />
      <RestoreOrFreshSheet
        visible={showRestoreConfirm}
        mode="confirm"
        onRestore={doRestore}
        onLater={() => setShowRestoreConfirm(false)}
        isLoading={isRestoring}
        progress={restoreProgress}
        cloudBookCount={cloudBookCount}
        C={C}
        Font={Font}
      />
      <FreshStartSheet
        visible={showFreshStart}
        onDismiss={() => setShowFreshStart(false)}
        onConfirm={doFreshStart}
        isLoading={isFreshStarting}
        statusLabel={freshStartStatus}
        C={C}
        Font={Font}
      />

      {/* ── Nothing-to-sync alert ── */}
      <Modal
        transparent
        statusBarTranslucent
        visible={showEmptyAlert}
        animationType="fade"
        onRequestClose={() => setShowEmptyAlert(false)}
      >
        <View style={st.alertBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowEmptyAlert(false)} />
          <View style={[st.alertBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[st.alertIconWrap, { backgroundColor: C.primaryLight }]}>
              <Feather name="inbox" size={28} color={C.primary} />
            </View>
            <Text style={[st.alertTitle, { color: C.text, fontFamily: Font.bold }]}>Nothing to sync</Text>
            <Text style={[st.alertBody, { color: C.textMuted, fontFamily: Font.regular }]}>
              Your local database is empty. Add some cashbooks or entries first.
            </Text>
            <TouchableOpacity
              style={[st.alertBtn, { backgroundColor: C.primary }]}
              onPress={() => setShowEmptyAlert(false)}
              activeOpacity={0.85}
            >
              <Text style={[st.alertBtnText, { fontFamily: Font.bold }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.background },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 48 },

  header: {
    backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  sectionLabel: {
    fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 4, marginLeft: 2,
  },

  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.border, marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    padding: 16,
  },

  statusRow:     { flexDirection: 'row', alignItems: 'center' },
  statusDot:     { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText:    { fontSize: 15 },
  statusSub:     { fontSize: 13 },
  statusDivider: { height: 1, marginVertical: 12 },
  syncMeta:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncMetaText:  { fontSize: 13 },
  errorText:     { fontSize: 13, lineHeight: 18, marginTop: 8 },

  rowDivider: { height: 1, marginHorizontal: 16 },

  gateCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 24,
    alignItems: 'center', marginTop: 24,
  },
  gateTitle:   { fontSize: 18, marginBottom: 8 },
  gateSub:     { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  gateBtn:     { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  gateBtnText: { fontSize: 14, color: '#fff' },

  actionsCol: { gap: 10 },

  dangerCard: { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 12 },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dangerIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dangerTitle: { fontSize: 14, lineHeight: 19 },
  dangerSub:   { fontSize: 11, lineHeight: 16 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 11,
  },
  dangerBtnText: { fontSize: 14, color: '#fff' },

  alertBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  alertBox: {
    width: '100%', borderRadius: 20, borderWidth: 1.5,
    padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  alertIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  alertTitle:   { fontSize: 18, marginBottom: 8 },
  alertBody:    { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  alertBtn:     { width: '100%', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  alertBtnText: { fontSize: 15, color: '#fff' },

  infoBox: {
    flexDirection: 'row', gap: 10, borderRadius: 12, borderWidth: 1,
    padding: 14, marginTop: 24,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
