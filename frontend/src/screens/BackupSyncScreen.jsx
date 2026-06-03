import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Alert, Animated, Modal,
} from 'react-native';
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
import { canAccess } from '../lib/canAccess';
import Toast from '../lib/toast';
import SyncConfirmSheet from '../components/ui/SyncConfirmSheet';
import ClearLocalDataSheet from '../components/ui/ClearLocalDataSheet';
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
  const iconColor = textColor;

  return (
    <TouchableOpacity
      style={[s.actionBtn, { backgroundColor: bg, borderColor: border, borderWidth: 1.5, opacity: disabled ? 0.6 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <View style={[s.actionBtnIcon, {
        backgroundColor: isDestructive
          ? C.danger + '22'
          : isSecondary ? C.primary + '22'
          : 'rgba(255,255,255,0.20)',
      }]}>
        <Feather name={icon} size={17} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.actionBtnLabel, { color: textColor, fontFamily: Font.bold }]}>{label}</Text>
        {sublabel ? (
          <Text style={[s.actionBtnSub, { color: textColor + 'AA', fontFamily: Font.regular }]}>{sublabel}</Text>
        ) : null}
      </View>
      {!disabled && (
        <Feather name="chevron-right" size={16} color={iconColor + 'AA'} />
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
    isOnline, isSyncing, lastSyncedAt, progress, syncError,
    startSync, setProgress, finishSync, failSync,
    isRestoring, restoreProgress, restoreError,
    startRestore, setRestoreProgress, finishRestore, failRestore,
  } = useSyncStore();
  const canSync = canAccess(user, 'cloud_sync');

  const [stats,              setStats]              = useState(null);
  const [statsLoading,       setStatsLoading]       = useState(true);
  const [netState,           setNetState]           = useState(null);
  const [delta,              setDelta]              = useState(null);
  const [deltaLoading,       setDeltaLoading]       = useState(true);
  const [cloudBookCount,     setCloudBookCount]     = useState(0);

  const [showSyncConfirm,    setShowSyncConfirm]    = useState(false);
  const [showClearConfirm,   setShowClearConfirm]   = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showFreshStart,     setShowFreshStart]     = useState(false);
  const [isClearing,         setIsClearing]         = useState(false);
  const [isFreshStarting,    setIsFreshStarting]    = useState(false);
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

    // Count cloud books for the restore sheet
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

  const isAlreadySynced = !deltaLoading && delta !== null && delta.toUpload === 0 && (stats?.total ?? 0) > 0;
  const hasCloudData    = delta?.hasCloudData ?? false;

  // ── Sync local → cloud ────────────────────────────────────────────────────
  const handleSync = useCallback(() => {
    if (isSyncing || isAlreadySynced) return;
    if (!isOnline) { Alert.alert('No connection', 'Please connect to the internet to sync your data.'); return; }
    if (!canSync)  { Alert.alert('Pro feature', 'Cloud backup & sync requires a Pro or Business plan.'); return; }
    if (!stats || stats.total === 0) { setShowEmptyAlert(true); return; }
    setShowSyncConfirm(true);
  }, [isSyncing, isAlreadySynced, isOnline, canSync, stats]);

  const doSync = useCallback(async () => {
    startSync();
    try {
      const result = await syncLocalToCloud((done, total, step) => setProgress(done, total, step));
      const ts = new Date().toISOString();
      finishSync(ts);
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

  // ── Restore cloud → local ─────────────────────────────────────────────────
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
  }, [startRestore, setRestoreProgress, finishRestore, failRestore, qc, loadData]);

  // ── Clear local data ──────────────────────────────────────────────────────
  const handleClearLocal = useCallback(() => {
    if (!stats || stats.total === 0) return;
    setShowClearConfirm(true);
  }, [stats]);

  const doClear = useCallback(async () => {
    setIsClearing(true);
    try {
      await localClearAll();
      const newStats = await getLocalStats();
      setStats(newStats);
      qc.invalidateQueries();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  }, [qc]);

  // ── Start fresh (delete cloud + local) ───────────────────────────────────
  const doFreshStart = useCallback(async () => {
    setIsFreshStarting(true);
    try {
      // Delete all cloud books (cascade deletes entries, categories, etc.)
      const cloudBooks = await apiGetBooks().catch(() => []);
      for (const book of cloudBooks) {
        await apiDeleteBook(book.id).catch(() => {});
      }
      // Clear local SQLite
      await localClearAll();
      qc.invalidateQueries();
      await loadData();
      setShowFreshStart(false);
      Toast.show({ type: 'success', text1: 'Fresh Start', text2: 'All data has been erased.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err?.message ?? 'Could not complete fresh start.' });
    } finally {
      setIsFreshStarting(false);
    }
  }, [qc, loadData]);

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

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

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
            <Text style={[st.errorText, { color: C.danger, fontFamily: Font.regular }]}>
              ⚠ {syncError}
            </Text>
          )}

          {/* Upload progress */}
          {isSyncing && (
            <View style={{ marginTop: 10 }}>
              <ProgressBar done={progress.done} total={progress.total} step={progress.step} accentColor={C.primary} />
            </View>
          )}

          {/* Restore progress */}
          {isRestoring && (
            <View style={{ marginTop: 10 }}>
              <ProgressBar done={restoreProgress.done} total={restoreProgress.total} step={restoreProgress.step} accentColor={C.cashIn} />
            </View>
          )}

          {restoreError && (
            <Text style={[st.errorText, { color: C.danger, fontFamily: Font.regular }]}>
              ⚠ {restoreError}
            </Text>
          )}
        </View>

        {/* ── Local data card ── */}
        <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>
          LOCAL DATA
        </Text>
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

        {/* ── Pro gate ── */}
        {!canSync ? (
          <View style={[st.gateCard, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B44' }]}>
            <Text style={{ fontSize: 28, marginBottom: 10 }}>👑</Text>
            <Text style={[st.gateTitle, { color: C.text, fontFamily: Font.bold }]}>
              Pro Feature
            </Text>
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

              {/* Sync Local → Cloud */}
              <ActionBtn
                icon={isSyncing ? 'loader' : isAlreadySynced ? 'check-circle' : 'upload-cloud'}
                label={isSyncing ? 'Syncing…' : isAlreadySynced ? 'All Data Synced' : 'Sync to Cloud'}
                sublabel={isAlreadySynced ? 'Local and cloud are in sync' : 'Upload local data to your cloud account'}
                onPress={handleSync}
                variant="primary"
                disabled={isSyncing || isAlreadySynced || isRestoring}
                C={C}
              />

              {/* Restore Cloud → Local */}
              <ActionBtn
                icon={isRestoring ? 'loader' : 'download-cloud'}
                label={isRestoring ? 'Restoring…' : 'Restore from Cloud'}
                sublabel={hasCloudData
                  ? `${cloudBookCount} book${cloudBookCount !== 1 ? 's' : ''} available in cloud`
                  : 'No cloud data found'
                }
                onPress={handleRestore}
                variant="secondary"
                disabled={isRestoring || isSyncing || !hasCloudData}
                C={C}
              />

              {/* Clear local (only shown when there's local data) */}
              {(stats?.total ?? 0) > 0 && (
                <TouchableOpacity
                  style={[st.clearBtn, { borderColor: C.border }]}
                  onPress={handleClearLocal}
                  disabled={isClearing || isSyncing || isRestoring}
                  activeOpacity={0.8}
                >
                  <Feather name="trash-2" size={14} color={C.textMuted} />
                  <Text style={[st.clearBtnText, { color: C.textMuted, fontFamily: Font.medium }]}>
                    Clear local data only
                  </Text>
                </TouchableOpacity>
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
                  <Text style={[st.dangerTitle, { color: C.danger, fontFamily: Font.bold }]}>
                    Start Fresh
                  </Text>
                  <Text style={[st.dangerSub, { color: C.danger + 'BB', fontFamily: Font.regular }]}>
                    Deletes all data from cloud and device permanently
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[st.dangerBtn, { backgroundColor: C.danger, opacity: (isFreshStarting || isSyncing || isRestoring) ? 0.6 : 1 }]}
                onPress={() => setShowFreshStart(true)}
                disabled={isFreshStarting || isSyncing || isRestoring}
                activeOpacity={0.85}
              >
                <Feather name="trash-2" size={15} color="#fff" />
                <Text style={[st.dangerBtnText, { fontFamily: Font.bold }]}>Start Fresh</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Info note ── */}
        <View style={[st.infoBox, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
          <Feather name="info" size={14} color={C.primary} />
          <Text style={[st.infoText, { color: C.primary, fontFamily: Font.regular }]}>
            {canSync
              ? 'Use Sync to upload local data. Use Restore to download cloud data to this device.'
              : 'Free plan stores data on this device only. Uninstalling the app will delete all data.'
            }
          </Text>
        </View>

      </ScrollView>

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

      <ClearLocalDataSheet
        visible={showClearConfirm}
        onDismiss={() => setShowClearConfirm(false)}
        onConfirm={doClear}
        isLoading={isClearing}
        stats={stats}
        C={C}
        Font={Font}
      />

      <RestoreOrFreshSheet
        visible={showRestoreConfirm}
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

  // Status card
  statusRow:     { flexDirection: 'row', alignItems: 'center' },
  statusDot:     { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText:    { fontSize: 15 },
  statusSub:     { fontSize: 13 },
  statusDivider: { height: 1, marginVertical: 12 },
  syncMeta:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncMetaText:  { fontSize: 13 },
  errorText:     { fontSize: 13, lineHeight: 18, marginTop: 8 },

  rowDivider: { height: 1, marginHorizontal: 16 },

  // Gate
  gateCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 24,
    alignItems: 'center', marginTop: 24,
  },
  gateTitle:   { fontSize: 18, marginBottom: 8 },
  gateSub:     { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  gateBtn:     { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 },
  gateBtnText: { fontSize: 14, color: '#fff' },

  // Actions
  actionsCol: { gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14,
  },
  actionBtnIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnLabel: { fontSize: 14, lineHeight: 20 },
  actionBtnSub:   { fontSize: 11, lineHeight: 16, marginTop: 1 },

  clearBtn: {
    height: 42, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  clearBtnText: { fontSize: 13 },

  // Danger zone
  dangerCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 12,
  },
  dangerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dangerIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  dangerTitle: { fontSize: 14, lineHeight: 19 },
  dangerSub:   { fontSize: 11, lineHeight: 16 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 11,
  },
  dangerBtnText: { fontSize: 14, color: '#fff' },

  // Nothing-to-sync alert modal
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
  alertBtn: {
    width: '100%', height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  alertBtnText: { fontSize: 15, color: '#fff' },

  // Info note
  infoBox: {
    flexDirection: 'row', gap: 10, borderRadius: 12, borderWidth: 1,
    padding: 14, marginTop: 24,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
