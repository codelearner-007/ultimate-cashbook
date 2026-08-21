import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Alert, Animated, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useTheme } from '../hooks/useTheme';
import { Font } from '../constants/fonts';
import Toast from '../lib/toast';
import SuccessDialog from '../components/ui/SuccessDialog';
import { generateLocalBackup, pickBackupFile, restoreLocalBackup } from '../lib/localBackup';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtExportedAt(iso) {
  if (!iso) return 'an unknown date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown date';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function summarizeCounts(counts) {
  const books   = counts?.books   ?? 0;
  const entries = counts?.entries ?? 0;
  return `${books} book${books !== 1 ? 's' : ''}, ${entries} ${entries === 1 ? 'entry' : 'entries'} backed up`;
}

const COUNT_ROWS = [
  { key: 'books',         icon: 'book',         label: 'Cashbooks' },
  { key: 'entries',       icon: 'list',         label: 'Entries' },
  { key: 'categories',    icon: 'tag',          label: 'Categories' },
  { key: 'customers',     icon: 'users',        label: 'Customers' },
  { key: 'suppliers',     icon: 'truck',        label: 'Suppliers' },
  { key: 'payment_modes', icon: 'credit-card',  label: 'Payment Modes' },
  { key: 'attachments',   icon: 'paperclip',    label: 'Attachments' },
];

// ── Action button (local to this screen — visually matches app-wide ActionBtn pattern) ──

const abStyles = StyleSheet.create({
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14 },
  icon:  { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, lineHeight: 20 },
  sub:   { fontSize: 11, lineHeight: 16, marginTop: 1 },
});

function ActionBtn({ icon, label, sublabel, onPress, variant, disabled, C, Font }) {
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

// ── Restore confirm bottom sheet (local to this screen) ─────────────────────────
//
// Shown after pickBackupFile() resolves a payload. Requires an explicit confirm
// tap before restoreLocalBackup() (destructive, wipes local data) is ever called.

function RestoreConfirmSheet({ visible, payload, isLoading, progress, onCancel, onConfirm, C, Font }) {
  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(600);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 140, friction: 18, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, bgOpacity]);

  const close = () => { if (!isLoading) onCancel(); };

  if (!visible) return null;

  const pct = progress?.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  // Recomputed live from the actual parsed data/attachments rather than trusting the
  // embedded payload.counts blob, so a hand-edited or stale backup file can't show
  // misleading numbers on the last screen before an irreversible restore.
  const d = payload?.data ?? {};
  const counts = {
    books:         (d.books ?? []).length,
    entries:       (d.entries ?? []).length,
    categories:    (d.categories ?? []).length,
    customers:     (d.customers ?? []).length,
    suppliers:     (d.suppliers ?? []).length,
    payment_modes: (d.payment_modes ?? []).length,
    attachments:   Object.keys(payload?.attachments ?? {}).length,
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.60)', opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={rs.anchor} pointerEvents="box-none">
        <Animated.View style={[rs.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[rs.handle, { backgroundColor: C.border }]} />

          {/* Header */}
          <View style={rs.headerRow}>
            <View style={[rs.iconCircle, { backgroundColor: C.danger }]}>
              <Feather name="upload" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rs.title, { color: C.text, fontFamily: Font.bold }]}>
                Restore Backup?
              </Text>
              <Text style={[rs.subtitle, { color: C.textMuted, fontFamily: Font.medium }]}>
                Backup from {fmtExportedAt(payload?.exported_at)}
              </Text>
            </View>
          </View>

          {/* Counts grid */}
          <View style={rs.countsGrid}>
            {COUNT_ROWS.map((row) => (
              <View key={row.key} style={[rs.countCell, { backgroundColor: C.background, borderColor: C.border }]}>
                <Feather name={row.icon} size={14} color={C.primary} />
                <Text style={[rs.countValue, { color: C.text, fontFamily: Font.bold }]}>
                  {counts[row.key] ?? 0}
                </Text>
                <Text style={[rs.countLabel, { color: C.textMuted, fontFamily: Font.regular }]}>
                  {row.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Warning */}
          <View style={[rs.warnBox, { backgroundColor: C.dangerLight, borderColor: C.danger + '44' }]}>
            <Feather name="alert-triangle" size={14} color={C.danger} />
            <Text style={[rs.warnText, { color: C.danger, fontFamily: Font.medium }]}>
              This will REPLACE all data currently on this device with the contents of this backup. This action cannot be undone.
            </Text>
          </View>

          {isLoading ? (
            <View style={[rs.progressWrap, { backgroundColor: C.dangerLight, borderColor: C.danger + '33' }]}>
              <View style={rs.progressRow}>
                <ActivityIndicator size="small" color={C.danger} />
                <Text style={[rs.progressLabel, { color: C.danger, fontFamily: Font.medium }]}>
                  {progress?.total > 0 ? `Restoring… (${progress.done}/${progress.total})` : 'Restoring…'}
                </Text>
              </View>
              <View style={[rs.trackBg, { backgroundColor: C.danger + '22' }]}>
                <View style={[rs.trackFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: C.danger }]} />
              </View>
            </View>
          ) : (
            <View style={rs.btnRow}>
              <TouchableOpacity
                style={[rs.btn, { borderColor: C.border }]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={[rs.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rs.btn, { backgroundColor: C.danger, borderColor: C.danger }]}
                onPress={onConfirm}
                activeOpacity={0.85}
              >
                <Feather name="upload" size={15} color="#fff" />
                <Text style={[rs.btnText, { color: '#fff', fontFamily: Font.bold }]}>Restore Backup</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const rs = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 17, lineHeight: 23 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  countsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  countCell:   {
    width: '31%', borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  countValue: { fontSize: 15, marginTop: 2 },
  countLabel: { fontSize: 10, textAlign: 'center' },

  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 20,
  },
  warnText: { flex: 1, fontSize: 12, lineHeight: 17 },

  progressWrap: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  progressRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { fontSize: 13, flex: 1 },
  trackBg:  { height: 5, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 5, borderRadius: 3 },

  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnText: { fontSize: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function LocalBackupScreen() {
  const router = useRouter();
  const { C, Font, isDark } = useTheme();
  const qc = useQueryClient();
  const st = makeStyles(C);

  const [isBackingUp,     setIsBackingUp]     = useState(false);
  const [backupProgress,  setBackupProgress]  = useState({ done: 0, total: 0 });
  const [isRestoring,     setIsRestoring]     = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({ done: 0, total: 0 });

  const [confirmPayload,   setConfirmPayload]   = useState(null);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showSuccess,      setShowSuccess]      = useState(false);

  const isBusy = isBackingUp || isRestoring;

  const handleBackup = useCallback(async () => {
    if (isBackingUp || isRestoring) return;
    setIsBackingUp(true);
    setBackupProgress({ done: 0, total: 0 });
    try {
      const result = await generateLocalBackup((done, total) => setBackupProgress({ done, total }));
      const title = result.savedToPublicStorage ? 'Backup Saved to Downloads' : 'Backup Saved on Device';
      Toast.show({ type: 'success', text1: title, text2: summarizeCounts(result) });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Backup Failed', text2: err?.message ?? 'Could not create the backup file.' });
    } finally {
      setIsBackingUp(false);
      setBackupProgress({ done: 0, total: 0 });
    }
  }, [isBackingUp, isRestoring]);

  const handlePickRestore = useCallback(async () => {
    if (isBackingUp || isRestoring) return;
    try {
      const payload = await pickBackupFile();
      if (!payload) return; // user cancelled
      setConfirmPayload(payload);
      setShowConfirmSheet(true);
    } catch (err) {
      Alert.alert('Invalid File', err?.message ?? 'This file could not be read as a backup.');
    }
  }, [isBackingUp, isRestoring]);

  const handleCancelConfirm = useCallback(() => {
    if (isRestoring) return;
    setShowConfirmSheet(false);
    setConfirmPayload(null);
  }, [isRestoring]);

  const doRestore = useCallback(async () => {
    if (!confirmPayload || isRestoring) return;
    setIsRestoring(true);
    setRestoreProgress({ done: 0, total: 0 });
    try {
      await restoreLocalBackup(confirmPayload, (done, total) => setRestoreProgress({ done, total }));
      qc.invalidateQueries();
      setShowConfirmSheet(false);
      setConfirmPayload(null);
      setShowSuccess(true);
    } catch (err) {
      // Leave the confirm sheet open so the user understands the restore did not complete
      Alert.alert('Restore Failed', err?.message ?? 'Could not restore this backup. Please try again.');
    } finally {
      setIsRestoring(false);
      setRestoreProgress({ done: 0, total: 0 });
    }
  }, [confirmPayload, isRestoring, qc]);

  const backupLabel = isBackingUp
    ? (backupProgress.total > 0 ? `Creating Backup… (${backupProgress.done}/${backupProgress.total})` : 'Creating Backup…')
    : 'Backup Locally';
  const backupSub = isBackingUp
    ? 'Please keep the app open…'
    : 'Includes all books, entries & attachments';
  const androidDownloadsNote = Platform.OS === 'android'
    ? " (including your Downloads folder, once you've picked one)"
    : '';

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
        <Text style={st.headerTitle}>Backup & Restore Locally</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Description card ── */}
        <View style={[st.card, { marginTop: 16 }]}>
          <View style={st.descHeader}>
            <View style={[st.iconBox, { backgroundColor: C.primaryLight }]}>
              <Feather name="hard-drive" size={20} color={C.primary} />
            </View>
            <Text style={[st.descTitle, { color: C.text, fontFamily: Font.bold }]}>
              Local Backup & Restore
            </Text>
          </View>
          <Text style={[st.descBody, { color: C.textMuted, fontFamily: Font.regular }]}>
            Creates a single backup file containing all your books, entries, categories, contacts, payment modes, and attachments — saved right on this device{androidDownloadsNote}. No internet connection or subscription is required.
            {'\n\n'}
            You can also send the file elsewhere — Google Drive, email, a computer — right after it's created, so you always have a copy off this device too.
          </Text>
        </View>

        {/* ── Create Backup ── */}
        <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 24 }]}>
          CREATE BACKUP
        </Text>
        <View style={[st.card, { padding: 12 }]}>
          <ActionBtn
            icon="download"
            label={backupLabel}
            sublabel={backupSub}
            onPress={handleBackup}
            variant="primary"
            disabled={isBusy}
            C={C}
            Font={Font}
          />
        </View>

        {/* ── Restore From Backup ── */}
        <Text style={[st.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 24 }]}>
          RESTORE FROM BACKUP
        </Text>
        <View style={[st.card, { padding: 12 }]}>
          <ActionBtn
            icon="upload"
            label="Restore from Backup File"
            sublabel="Select a previously created backup file"
            onPress={handlePickRestore}
            variant="secondary"
            disabled={isBusy}
            C={C}
            Font={Font}
          />
        </View>

        {/* ── Info note ── */}
        <View style={[st.infoBox, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
          <Feather name="info" size={14} color={C.primary} />
          <Text style={[st.infoText, { color: C.primary, fontFamily: Font.regular }]}>
            This is separate from cloud Backup & Sync — local backup files stay on this device and never reach the cloud unless you share them yourself. Available to every plan, no subscription needed.
          </Text>
        </View>

      </ScrollView>

      <RestoreConfirmSheet
        visible={showConfirmSheet}
        payload={confirmPayload}
        isLoading={isRestoring}
        progress={restoreProgress}
        onCancel={handleCancelConfirm}
        onConfirm={doRestore}
        C={C}
        Font={Font}
      />

      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title="Backup Restored!"
        subtitle="All your data has been restored to this device."
      />

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

  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconBox:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  descTitle:  { fontSize: 16, flex: 1 },
  descBody:   { fontSize: 13, lineHeight: 20 },

  infoBox: {
    flexDirection: 'row', gap: 10, borderRadius: 12, borderWidth: 1,
    padding: 14, marginTop: 24,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
