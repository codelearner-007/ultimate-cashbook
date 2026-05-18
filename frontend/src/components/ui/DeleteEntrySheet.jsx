import { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Bottom-sheet confirmation for deleting a single entry.
 * No text-input confirmation required — simpler than DeleteBookSheet.
 *
 * Props:
 *   visible    — controls visibility
 *   entry      — { type, amount, remark, entry_date } (can be null while animating out)
 *   isLoading  — show spinner on Delete button while mutation is pending
 *   onDismiss  — called after the sheet animates closed (cancel or backdrop tap)
 *   onConfirm  — called when the user taps Delete
 *   C, Font    — theme tokens
 */
export default function DeleteEntrySheet({
  visible, entry, isLoading, onDismiss, onConfirm, C, Font,
}) {
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((callback) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => callback?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = useCallback(() => {
    animateClose(onDismiss);
  }, [animateClose, onDismiss]);

  if (!visible) return null;

  const isIn   = entry?.type === 'in';
  const amount = entry?.amount != null
    ? Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const typeLabel  = isIn ? 'Cash In' : 'Cash Out';
  const typeColor  = isIn ? C.cashIn : C.danger;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, s.dimBg, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Header */}
          <View style={s.headerRow}>
            <View style={[s.iconCircle, { backgroundColor: C.danger, shadowColor: C.danger }]}>
              <Feather name="trash-2" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>Delete Entry</Text>
              <Text style={[s.subtitle, { color: C.danger, fontFamily: Font.medium }]}>
                This cannot be undone
              </Text>
            </View>
          </View>

          {/* Entry preview */}
          <View style={[s.previewCard, { backgroundColor: C.background, borderColor: C.border }]}>
            <View style={s.previewRow}>
              <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Type</Text>
              <Text style={[s.previewValue, { color: typeColor, fontFamily: Font.semiBold }]}>{typeLabel}</Text>
            </View>
            <View style={[s.previewDivider, { backgroundColor: C.border }]} />
            <View style={s.previewRow}>
              <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Amount</Text>
              <Text style={[s.previewValue, { color: C.text, fontFamily: Font.bold }]}>{amount}</Text>
            </View>
            {!!entry?.remark && (
              <>
                <View style={[s.previewDivider, { backgroundColor: C.border }]} />
                <View style={s.previewRow}>
                  <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Note</Text>
                  <Text style={[s.previewValue, { color: C.text, fontFamily: Font.regular }]} numberOfLines={2}>
                    {entry.remark}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.border }]}
              onPress={close}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={[s.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, s.btnDelete, { backgroundColor: C.danger, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="trash-2" size={15} color="#fff" />
              }
              <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>
                {isLoading ? 'Deleting…' : 'Delete Entry'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dimBg:  { backgroundColor: 'rgba(0,0,0,0.55)' },
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title:    { fontSize: 16, lineHeight: 22 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },

  previewCard: {
    borderRadius: 14, borderWidth: 1.5,
    marginBottom: 20, overflow: 'hidden',
  },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  previewDivider: { height: 1 },
  previewLabel:   { fontSize: 13 },
  previewValue:   { fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnDelete: { borderWidth: 0 },
  btnText:   { fontSize: 14 },
});
