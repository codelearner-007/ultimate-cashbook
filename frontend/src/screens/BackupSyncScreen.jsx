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
import { useSyncStore }  from '../store/syncStore';
import { Font } from '../constants/fonts';
import { getLocalStats, syncLocalToCloud, getCloudDeltaStats } from '../lib/syncManager';
import { localClearAll } from '../lib/localDb';
import { canAccess } from '../lib/canAccess';
import Toast from '../lib/toast';
import SyncConfirmSheet from '../components/ui/SyncConfirmSheet';
import ClearLocalDataSheet from '../components/ui/ClearLocalDataSheet';

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

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BackupSyncScreen() {
  const router  = useRouter();
  const { C, Font, isDark } = useTheme();
  const qc      = useQueryClient();
  const s       = makeStyles(C);

  const user          = useAuthStore(s => s.user);
  const { isOnline, isSyncing, lastSyncedAt, progress, syncError,
          startSync, setProgress, finishSync, failSync } = useSyncStore();
  const canSync       = canAccess(user, 'cloud_sync');

  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [netState,     setNetState]     = useState(null);
  const [delta,        setDelta]        = useState(null);
  const [deltaLoading, setDeltaLoading] = useState(true);
  const [syncResult,      setSyncResult]      = useState({ synced: 0, skipped: 0, alreadySynced: 0 });
  const [showSyncConfirm,  setShowSyncConfirm]  = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing,       setIsClearing]       = useState(false);
  const [showEmptyAlert,   setShowEmptyAlert]   = useState(false);

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

  // Load local stats + network state + cloud delta in parallel
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, net, d] = await Promise.all([
        getLocalStats(),
        Network.getNetworkStateAsync().catch(() => null),
        getCloudDeltaStats(),
      ]);
      if (mounted) {
        setStats(s);
        setNetState(net);
        setStatsLoading(false);
        setDelta(d);
        setDeltaLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const isAlreadySynced = !deltaLoading && delta !== null && delta.toUpload === 0 && (stats?.total ?? 0) > 0;

  const handleSync = useCallback(() => {
    if (isSyncing || isAlreadySynced) return;
    if (!isOnline) {
      Alert.alert('No connection', 'Please connect to the internet to sync your data.');
      return;
    }
    if (!canSync) {
      Alert.alert('Pro feature', 'Cloud backup & sync requires a Pro or Business plan.');
      return;
    }
    if (!stats || stats.total === 0) {
      setShowEmptyAlert(true);
      return;
    }
    setShowSyncConfirm(true);
  }, [isSyncing, isAlreadySynced, isOnline, canSync, stats]);

  const doSync = useCallback(async () => {
    startSync();
    try {
      const result = await syncLocalToCloud((done, total, step) => {
        setProgress(done, total, step);
      });
      const ts = new Date().toISOString();
      finishSync(ts);
      setShowSyncConfirm(false);
      qc.invalidateQueries();
      const [newStats, newDelta] = await Promise.all([getLocalStats(), getCloudDeltaStats()]);
      setStats(newStats);
      setDelta(newDelta);
      const r = { synced: result.synced, skipped: result.skipped, alreadySynced: result.alreadySynced ?? 0 };
      setSyncResult(r);
      const msg = r.synced === 0 && r.alreadySynced > 0
        ? 'Everything is already synced to cloud.'
        : r.synced > 0 && r.alreadySynced > 0
          ? `${r.synced} new item(s) uploaded. ${r.alreadySynced} already synced.`
          : `${r.synced} item(s) uploaded to cloud.`;
      Toast.show({ type: 'success', text1: 'Data Synced', text2: msg });
    } catch (err) {
      setShowSyncConfirm(false);
      failSync(err?.message ?? 'Sync failed. Please try again.');
    }
  }, [startSync, setProgress, finishSync, failSync, qc]);

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

  const lastSyncLabel = fmtDate(lastSyncedAt);

  return (
    <SafeAreaView applyTop style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/settings')}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Backup & Sync</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Status card ── */}
        <View style={[s.card, { borderColor: isOnline ? C.cashIn + '66' : C.danger + '66' }]}>
          <View style={s.statusRow}>
            <Animated.View style={[s.statusDot, { backgroundColor: isOnline ? C.cashIn : C.danger, opacity: dotOpacity }]} />
            <Text style={[s.statusText, { color: C.text, fontFamily: Font.semiBold }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            {netState?.type && (
              <Text style={[s.statusSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                {'  ·  '}{netState.type}
              </Text>
            )}
          </View>

          <View style={[s.statusDivider, { backgroundColor: C.border }]} />

          <View style={s.syncMeta}>
            <Feather name="clock" size={13} color={C.textMuted} />
            <Text style={[s.syncMetaText, { color: C.textMuted, fontFamily: Font.regular }]}>
              {lastSyncLabel ? `Last synced: ${lastSyncLabel}` : 'Never synced'}
            </Text>
          </View>

          {syncError && (
            <Text style={[s.errorText, { color: C.danger, fontFamily: Font.regular }]}>
              ⚠ {syncError}
            </Text>
          )}

          {/* Progress */}
          {isSyncing && (
            <View style={{ marginTop: 10 }}>
              <ProgressBar done={progress.done} total={progress.total} step={progress.step} accentColor={C.primary} />
            </View>
          )}
        </View>

        {/* ── Local data card ── */}
        <Text style={[s.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>
          LOCAL DATA
        </Text>
        <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
          {statsLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontFamily: Font.regular, fontSize: 13 }}>Loading…</Text>
            </View>
          ) : (
            <>
              {[
                { icon: 'book',       label: 'Cashbooks',    value: stats?.books         ?? 0 },
                { icon: 'list',       label: 'Entries',      value: stats?.entries       ?? 0 },
                { icon: 'tag',        label: 'Categories',   value: stats?.categories    ?? 0 },
                { icon: 'users',      label: 'Customers',    value: stats?.customers     ?? 0 },
                { icon: 'truck',      label: 'Suppliers',    value: stats?.suppliers     ?? 0 },
              ].map((row, i, arr) => (
                <View key={row.label}>
                  <StatRow icon={row.icon} label={row.label} value={row.value} C={C} />
                  {i < arr.length - 1 && <View style={[s.rowDivider, { backgroundColor: C.border }]} />}
                </View>
              ))}
            </>
          )}
        </View>

        {/* ── Pro gate or Sync button ── */}
        {!canSync ? (
          <View style={[s.gateCard, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B44' }]}>
            <Text style={{ fontSize: 28, marginBottom: 10 }}>👑</Text>
            <Text style={[s.gateTitle, { color: C.text, fontFamily: Font.bold }]}>
              Pro Feature
            </Text>
            <Text style={[s.gateSub, { color: C.textMuted, fontFamily: Font.regular }]}>
              Cloud backup & sync requires a Pro or Business subscription. Your data is safe locally.
            </Text>
            <TouchableOpacity
              style={[s.gateBtn, { backgroundColor: '#F59E0B' }]}
              onPress={() => router.push('/(app)/settings/subscription')}
              activeOpacity={0.85}
            >
              <Text style={[s.gateBtnText, { fontFamily: Font.bold }]}>View Plans 👑</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.actionsCol}>
            {/* Sync Now */}
            <TouchableOpacity
              style={[
                s.syncBtn,
                {
                  backgroundColor: isSyncing
                    ? C.primaryLight
                    : isAlreadySynced
                      ? C.cashInLight
                      : C.primary,
                },
              ]}
              onPress={handleSync}
              disabled={isSyncing || isAlreadySynced}
              activeOpacity={0.85}
            >
              <Feather
                name={isSyncing ? 'loader' : isAlreadySynced ? 'check-circle' : 'upload-cloud'}
                size={18}
                color={isSyncing ? C.primary : isAlreadySynced ? C.cashIn : '#fff'}
              />
              <Text style={[s.syncBtnText, { color: isSyncing ? C.primary : isAlreadySynced ? C.cashIn : '#fff', fontFamily: Font.bold }]}>
                {isSyncing ? 'Syncing…' : isAlreadySynced ? 'All Data Synced' : 'Sync Local Data to Cloud'}
              </Text>
            </TouchableOpacity>

            {/* Clear local */}
            {stats?.total > 0 && (
              <TouchableOpacity
                style={[s.clearBtn, { borderColor: C.danger + '66' }]}
                onPress={handleClearLocal}
                activeOpacity={0.8}
              >
                <Feather name="trash-2" size={15} color={C.danger} />
                <Text style={[s.clearBtnText, { color: C.danger, fontFamily: Font.medium }]}>
                  Clear local data
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Info note ── */}
        <View style={[s.infoBox, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
          <Feather name="info" size={14} color={C.primary} />
          <Text style={[s.infoText, { color: C.primary, fontFamily: Font.regular }]}>
            {canSync
              ? 'Data is saved locally first. Use the Sync button above to upload your data to the cloud.'
              : 'Free plan stores data on this device only. Uninstalling the app will delete all data.'
            }
          </Text>
        </View>

      </ScrollView>

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

      {/* ── Nothing-to-sync themed alert ── */}
      <Modal
        transparent
        statusBarTranslucent
        visible={showEmptyAlert}
        animationType="fade"
        onRequestClose={() => setShowEmptyAlert(false)}
      >
        <View style={s.alertBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowEmptyAlert(false)} />
          <View style={[s.alertBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[s.alertIconWrap, { backgroundColor: C.primaryLight }]}>
              <Feather name="inbox" size={28} color={C.primary} />
            </View>
            <Text style={[s.alertTitle, { color: C.text, fontFamily: Font.bold }]}>Nothing to sync</Text>
            <Text style={[s.alertBody, { color: C.textMuted, fontFamily: Font.regular }]}>
              Your local database is empty. Add some cashbooks or entries first.
            </Text>
            <TouchableOpacity
              style={[s.alertBtn, { backgroundColor: C.primary }]}
              onPress={() => setShowEmptyAlert(false)}
              activeOpacity={0.85}
            >
              <Text style={[s.alertBtnText, { fontFamily: Font.bold }]}>Got it</Text>
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
    fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 24, marginLeft: 2,
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
  actionsCol: { marginTop: 24, gap: 12 },
  syncBtn: {
    height: 52, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  syncBtnText: { fontSize: 15 },
  clearBtn: {
    height: 46, borderRadius: 14, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  clearBtnText: { fontSize: 14 },

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
