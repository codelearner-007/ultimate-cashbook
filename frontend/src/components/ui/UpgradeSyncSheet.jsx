/**
 * Shown right after a free-tier user successfully upgrades to Pro/Business.
 * Compares local data against cloud to show only the delta (new/updated/removed),
 * so re-subscribers aren't shown misleading totals for data already in cloud.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Font } from '../../constants/fonts';
import { getCloudDeltaStats, syncLocalToCloud } from '../../lib/syncManager';
import { useSyncStore } from '../../store/syncStore';

// variant: 'upload' (accent), 'synced' (green), 'cloud' (orange warning)
function StatChip({ icon, value, label, variant, accentColor }) {
  if (!value) return null;
  const color = variant === 'synced' ? '#10B981' : variant === 'cloud' ? '#F59E0B' : accentColor;
  return (
    <View style={[chip.wrap, { backgroundColor: color + '14', borderColor: color + '33' }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[chip.val, { color, fontFamily: Font.bold }]}>{value}</Text>
      <Text style={[chip.lbl, { color, fontFamily: Font.regular }]}>{label}</Text>
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

  const [delta,        setDelta]        = useState(null);   // getCloudDeltaStats result
  const [loadingDelta, setLoadingDelta] = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [done,         setDone]         = useState(false);
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
    setDelta(null);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
    // Load delta stats (compares local vs cloud)
    setLoadingDelta(true);
    getCloudDeltaStats()
      .then(setDelta)
      .catch(() => setDelta({ hasCloudData: false, toUpload: 0, localEntries: 0, newEntries: 0, alreadySyncedEntries: 0, onlyInCloudEntries: 0, newBooks: 0, localBooks: 0 }))
      .finally(() => setLoadingDelta(false));
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

  // Derive display state from delta
  const toUpload       = delta?.toUpload             ?? 0;
  const alreadySynced  = delta?.alreadySyncedEntries ?? 0;
  const onlyInCloud    = delta?.onlyInCloudEntries   ?? 0;
  const newBooks       = delta?.newBooks             ?? 0;
  const newEntries     = delta?.newEntries           ?? 0;
  const hasCloudData   = delta?.hasCloudData         ?? false;
  const hasLocal       = (delta?.localEntries ?? 0) > 0 || (delta?.localBooks ?? 0) > 0;

  // Subtitle logic
  let subtitle;
  if (done) {
    subtitle = 'Your local data has been uploaded to the cloud. Everything is backed up.';
  } else if (loadingDelta || delta === null) {
    subtitle = 'Checking what needs to be synced…';
  } else if (hasCloudData && toUpload === 0 && onlyInCloud === 0) {
    subtitle = 'Your local data is already fully synced with the cloud. Nothing new to upload.';
  } else if (hasCloudData && toUpload === 0 && onlyInCloud > 0) {
    subtitle = `Your local data is synced. The cloud has ${onlyInCloud} ${onlyInCloud === 1 ? 'entry' : 'entries'} not on this device.`;
  } else if (hasCloudData && toUpload > 0) {
    subtitle = `You have changes since your last sync. Upload to keep your cloud backup up to date.`;
  } else if (hasLocal) {
    subtitle = 'You have local data on this device. Upload it to the cloud now to keep it safe.';
  } else {
    subtitle = 'Cloud backup is now active. All your new entries will sync automatically.';
  }

  // Whether to show the upload button
  const canUpload = !done && !loadingDelta && toUpload > 0;
  const alreadyInSync = !done && !loadingDelta && delta !== null && toUpload === 0;

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
            {subtitle}
          </Text>

          {/* Loading delta indicator */}
          {loadingDelta && !done && (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={[s.loadingText, { color: C.textSubtle, fontFamily: Font.regular }]}>
                Comparing with cloud…
              </Text>
            </View>
          )}

          {/* Delta chips — shown once delta is loaded and not yet done */}
          {!loadingDelta && delta !== null && !done && (
            <View style={s.chipsRow}>
              {/* New / updated items to upload */}
              {newEntries > 0 && (
                <StatChip
                  icon="upload-cloud"
                  value={newEntries}
                  label={newEntries === 1 ? 'new entry' : 'new entries'}
                  variant="upload"
                  accentColor={accentColor}
                />
              )}
              {newBooks > 0 && (
                <StatChip
                  icon="book"
                  value={newBooks}
                  label={newBooks === 1 ? 'new book' : 'new books'}
                  variant="upload"
                  accentColor={accentColor}
                />
              )}
              {/* Already synced items */}
              {alreadySynced > 0 && (
                <StatChip
                  icon="check-circle"
                  value={alreadySynced}
                  label="already synced"
                  variant="synced"
                  accentColor={accentColor}
                />
              )}
              {/* Entries only in cloud (not locally — deleted or edited on this device) */}
              {onlyInCloud > 0 && (
                <StatChip
                  icon="cloud"
                  value={onlyInCloud}
                  label="only in cloud"
                  variant="cloud"
                  accentColor={accentColor}
                />
              )}
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
          ) : canUpload ? (
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
                  {syncing ? 'Uploading…' : `Upload ${toUpload} Item${toUpload !== 1 ? 's' : ''}`}
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
              style={[s.btn, { backgroundColor: alreadyInSync ? '#10B981' : accentColor, opacity: loadingDelta ? 0.6 : 1 }]}
              onPress={close}
              disabled={loadingDelta}
              activeOpacity={0.85}
            >
              <Feather name={alreadyInSync ? 'check' : 'check'} size={16} color="#fff" />
              <Text style={[s.btnText, { fontFamily: Font.bold }]}>
                {alreadyInSync ? 'Already in Sync' : 'Got it!'}
              </Text>
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

  loadingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  loadingText: { fontSize: 12 },

  chipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 },
  progress:   { fontSize: 12, textAlign: 'center', marginBottom: 16 },

  btnCol:        { gap: 10 },
  btn:           { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnText:       { fontSize: 15, color: '#fff' },
  btnOutline:    { height: 46, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText:{ fontSize: 13 },
});
