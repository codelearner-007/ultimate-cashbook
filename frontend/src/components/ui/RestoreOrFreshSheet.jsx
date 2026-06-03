import { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Shown at app launch when the user has cloud data but local DB is empty.
 * Offers two choices: Restore (pull cloud → local) or Later (proceed without restoring).
 *
 * Props:
 *   visible        — boolean
 *   onRestore      — () => void   — user chose to restore now
 *   onLater        — () => void   — user chose to skip for now
 *   isLoading      — boolean      — restore in progress
 *   progress       — { done, total, step }
 *   cloudBookCount — number       — how many books are in the cloud
 *   C, Font        — theme objects
 */
export default function RestoreOrFreshSheet({
  visible, onRestore, onLater, isLoading,
  progress, cloudBookCount, C, Font,
}) {
  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((callback) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => callback?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(600);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 140, friction: 18, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, bgOpacity]);

  const close = () => { if (!isLoading) animateClose(onLater); };

  if (!visible) return null;

  const pct = progress?.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const books = cloudBookCount ?? 0;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.60)', opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Header */}
          <View style={s.headerRow}>
            <View style={[s.iconCircle, { backgroundColor: C.primary }]}>
              <Feather name="cloud" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>
                Cloud Data Found
              </Text>
              <Text style={[s.subtitle, { color: C.primary, fontFamily: Font.medium }]}>
                {books} book{books !== 1 ? 's' : ''} in your cloud account
              </Text>
            </View>
          </View>

          <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            Your device has no local data, but your cloud account has data from a previous session. What would you like to do?
          </Text>

          {/* Progress bar (shown while restoring) */}
          {isLoading && (
            <View style={[s.progressWrap, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
              <View style={s.progressRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={[s.progressLabel, { color: C.primary, fontFamily: Font.medium }]}>
                  {progress?.step || 'Downloading…'}
                </Text>
              </View>
              <View style={[s.trackBg, { backgroundColor: C.primary + '22' }]}>
                <View style={[s.trackFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: C.primary }]} />
              </View>
              {progress?.total > 0 && (
                <Text style={[s.progressCount, { color: C.primary, fontFamily: Font.regular }]}>
                  {progress.done} / {progress.total}
                </Text>
              )}
            </View>
          )}

          {/* Option cards */}
          {!isLoading && (
            <View style={s.optionsRow}>
              {/* Restore */}
              <TouchableOpacity
                style={[s.optionCard, { backgroundColor: C.primaryLight, borderColor: C.primary + '55' }]}
                onPress={onRestore}
                activeOpacity={0.82}
              >
                <View style={[s.optionIcon, { backgroundColor: C.primary }]}>
                  <Feather name="download-cloud" size={18} color="#fff" />
                </View>
                <Text style={[s.optionTitle, { color: C.primary, fontFamily: Font.bold }]}>
                  Restore
                </Text>
                <Text style={[s.optionSub, { color: C.primary + 'BB', fontFamily: Font.regular }]}>
                  Download your cloud data to this device
                </Text>
              </TouchableOpacity>

              {/* Later */}
              <TouchableOpacity
                style={[s.optionCard, { backgroundColor: C.background, borderColor: C.border }]}
                onPress={onLater}
                activeOpacity={0.82}
              >
                <View style={[s.optionIcon, { backgroundColor: C.textMuted + '33' }]}>
                  <Feather name="clock" size={18} color={C.textMuted} />
                </View>
                <Text style={[s.optionTitle, { color: C.text, fontFamily: Font.bold }]}>
                  Later
                </Text>
                <Text style={[s.optionSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                  Start fresh locally, restore from Settings anytime
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Info note */}
          <View style={[s.infoBox, { backgroundColor: C.primaryLight, borderColor: C.primary + '33' }]}>
            <Feather name="info" size={13} color={C.primary} />
            <Text style={[s.infoText, { color: C.primary, fontFamily: Font.regular }]}>
              You can restore cloud data at any time from Settings → Backup & Sync.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 24,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 17, lineHeight: 23 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  body:     { fontSize: 13, lineHeight: 20, marginBottom: 18, color: '#64748B' },

  // Progress
  progressWrap: {
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 18, gap: 8,
  },
  progressRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { fontSize: 13, flex: 1 },
  trackBg:  { height: 5, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 5, borderRadius: 3 },
  progressCount: { fontSize: 11, textAlign: 'right' },

  // Option cards
  optionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  optionCard: {
    flex: 1, borderRadius: 16, borderWidth: 1.5,
    padding: 14, alignItems: 'center', gap: 6,
  },
  optionIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  optionTitle: { fontSize: 14, textAlign: 'center' },
  optionSub:   { fontSize: 11, lineHeight: 16, textAlign: 'center' },

  // Info
  infoBox: {
    flexDirection: 'row', gap: 8, borderRadius: 10,
    borderWidth: 1, padding: 12, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
