/**
 * Shown right after a free-tier user successfully upgrades to Pro/Business.
 * Displays a summary of their local data and offers to sync it to the cloud.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Font } from '../../constants/fonts';
import { getLocalStats, syncLocalToCloud } from '../../lib/syncManager';
import { useSyncStore } from '../../store/syncStore';

function StatChip({ icon, value, label, accentColor }) {
  if (!value) return null;
  return (
    <View style={[chip.wrap, { backgroundColor: accentColor + '14', borderColor: accentColor + '33' }]}>
      <Feather name={icon} size={13} color={accentColor} />
      <Text style={[chip.val, { color: accentColor, fontFamily: Font.bold }]}>{value}</Text>
      <Text style={[chip.lbl, { color: accentColor, fontFamily: Font.regular }]}>{label}</Text>
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  val:  { fontSize: 14 },
  lbl:  { fontSize: 12 },
});

export default function UpgradeSyncSheet({ visible, planName, planColor, onDismiss, C }) {
  const qc          = useQueryClient();
  const accentColor = planColor ?? '#F59E0B';

  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [stats,   setStats]   = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [done,    setDone]    = useState(false);
  const [progressText, setProgressText] = useState('');
  const { finishSync } = useSyncStore();

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(600);
    bgOpacity.setValue(0);
    setDone(false);
    setSyncing(false);
    setProgressText('');
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
    // Load local stats
    getLocalStats().then(setStats).catch(() => setStats({ total: 0 }));
  }, [visible]);

  const close = useCallback(() => animateClose(onDismiss), [animateClose, onDismiss]);

  const handleSync = useCallback(async () => {
    if (syncing || done) return;
    setSyncing(true);
    try {
      await syncLocalToCloud((d, total, step) => setProgressText(`${step} (${d}/${total})`));
      finishSync(new Date().toISOString());
      qc.invalidateQueries();
      setDone(true);
      setSyncing(false);
    } catch {
      setSyncing(false);
      setProgressText('Sync failed. Try again from Settings → Backup & Sync.');
    }
  }, [syncing, done, finishSync, qc]);

  if (!visible) return null;

  const hasLocal = (stats?.total ?? 0) > 0;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.dim, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={done ? close : undefined} />
      </Animated.View>

      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Crown icon */}
          <View style={s.iconRow}>
            <View style={[s.iconCircle, { backgroundColor: accentColor + '18', borderColor: accentColor + '33' }]}>
              <Text style={{ fontSize: 30, lineHeight: 36 }}>👑</Text>
            </View>
          </View>

          <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>
            {done ? 'All synced!' : `Welcome to ${planName}!`}
          </Text>
          <Text style={[s.sub, { color: C.textMuted, fontFamily: Font.regular }]}>
            {done
              ? 'Your local data has been uploaded to the cloud. Everything is backed up.'
              : hasLocal
                ? 'You have local data on this device. Upload it to the cloud now to keep it safe.'
                : 'Cloud backup is now active. All your new entries will sync automatically.'
            }
          </Text>

          {/* Local data chips */}
          {hasLocal && !done && (
            <View style={s.chipsRow}>
              <StatChip icon="book"  value={stats?.books}      label="books"      accentColor={accentColor} />
              <StatChip icon="list"  value={stats?.entries}    label="entries"    accentColor={accentColor} />
              <StatChip icon="tag"   value={stats?.categories} label="categories" accentColor={accentColor} />
            </View>
          )}

          {/* Progress text */}
          {syncing && progressText ? (
            <Text style={[s.progress, { color: C.textMuted, fontFamily: Font.regular }]}>{progressText}</Text>
          ) : null}

          {/* Buttons */}
          {done ? (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: accentColor }]}
              onPress={close}
              activeOpacity={0.85}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={[s.btnText, { fontFamily: Font.bold }]}>Done</Text>
            </TouchableOpacity>
          ) : hasLocal ? (
            <View style={s.btnCol}>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: accentColor, opacity: syncing ? 0.75 : 1 }]}
                onPress={handleSync}
                disabled={syncing}
                activeOpacity={0.85}
              >
                {syncing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="upload-cloud" size={16} color="#fff" />
                }
                <Text style={[s.btnText, { fontFamily: Font.bold }]}>
                  {syncing ? 'Uploading…' : 'Upload Local Data'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnOutline, { borderColor: C.border }]}
                onPress={close}
                disabled={syncing}
                activeOpacity={0.8}
              >
                <Text style={[s.btnOutlineText, { color: C.textMuted, fontFamily: Font.medium }]}>
                  Later (from Settings → Backup & Sync)
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: accentColor }]}
              onPress={close}
              activeOpacity={0.85}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={[s.btnText, { fontFamily: Font.bold }]}>Got it!</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim:    { backgroundColor: 'rgba(0,0,0,0.6)' },
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingBottom: 40, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  iconRow:    { alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 72, height: 72, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 22, textAlign: 'center', marginBottom: 10 },
  sub:        { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 18, paddingHorizontal: 4 },

  chipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 },
  progress:   { fontSize: 12, textAlign: 'center', marginBottom: 16 },

  btnCol:        { gap: 10 },
  btn:           { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnText:       { fontSize: 15, color: '#fff' },
  btnOutline:    { height: 46, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText:{ fontSize: 13 },
});
