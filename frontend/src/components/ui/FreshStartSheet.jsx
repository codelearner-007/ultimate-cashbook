import { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Two-step destructive confirmation sheet for "Start Fresh".
 * Step 1: Warn the user about what will be deleted.
 * Step 2: Final confirm button (red, explicit label).
 *
 * "Start Fresh" deletes all cloud data AND clears local data — permanent.
 *
 * Props:
 *   visible    — boolean
 *   onDismiss  — () => void
 *   onConfirm  — () => void
 *   isLoading  — boolean
 *   C, Font    — theme objects
 */
export default function FreshStartSheet({ visible, onDismiss, onConfirm, isLoading, statusLabel, C, Font }) {
  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(1);  // 1 = warning, 2 = final confirm

  const animateClose = useCallback((callback) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => { setStep(1); callback?.(); });
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    slideY.setValue(600);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 140, friction: 18, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, bgOpacity]);

  const close = () => { if (!isLoading) animateClose(onDismiss); };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)', opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Icon + Title */}
          <View style={s.headerRow}>
            <View style={[s.iconCircle, { backgroundColor: C.danger }]}>
              <Feather name="alert-triangle" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>
                Start Fresh
              </Text>
              <Text style={[s.subtitle, { color: C.danger, fontFamily: Font.medium }]}>
                {step === 1 ? 'This cannot be undone' : 'Are you absolutely sure?'}
              </Text>
            </View>
          </View>

          {step === 1 ? (
            <>
              {/* Step 1 — what will be deleted */}
              <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
                Starting fresh will permanently erase all your data:
              </Text>

              {[
                { icon: 'cloud-off',  label: 'All books and entries deleted from cloud' },
                { icon: 'smartphone', label: 'All local data cleared from this device' },
                { icon: 'users',      label: 'All contacts, categories, and payment modes removed' },
              ].map((item) => (
                <View key={item.icon} style={s.bulletRow}>
                  <View style={[s.bulletIcon, { backgroundColor: C.dangerLight }]}>
                    <Feather name={item.icon} size={14} color={C.danger} />
                  </View>
                  <Text style={[s.bulletText, { color: C.text, fontFamily: Font.regular }]}>
                    {item.label}
                  </Text>
                </View>
              ))}

              <View style={[s.warnBox, { backgroundColor: C.dangerLight, borderColor: C.danger + '44' }]}>
                <Feather name="alert-circle" size={14} color={C.danger} />
                <Text style={[s.warnText, { color: C.danger, fontFamily: Font.medium }]}>
                  This action is permanent and cannot be recovered.
                </Text>
              </View>

              <View style={s.btnRow}>
                <TouchableOpacity
                  style={[s.btn, { borderColor: C.border }]}
                  onPress={close}
                  activeOpacity={0.8}
                >
                  <Text style={[s.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: C.danger, borderColor: C.danger }]}
                  onPress={() => setStep(2)}
                  activeOpacity={0.85}
                >
                  <Feather name="chevron-right" size={15} color="#fff" />
                  <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>Continue</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Step 2 — final confirm */}
              <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
                You are about to permanently delete all cloud and local data. There is no way to recover this data after deletion.
              </Text>

              <View style={[s.finalWarnBox, { backgroundColor: C.dangerLight, borderColor: C.danger + '66' }]}>
                <Text style={[s.finalWarnTitle, { color: C.danger, fontFamily: Font.bold }]}>
                  Last chance — confirm deletion
                </Text>
                <Text style={[s.finalWarnSub, { color: C.danger + 'CC', fontFamily: Font.regular }]}>
                  All books, entries, categories, contacts, and cloud data will be erased.
                </Text>
              </View>

              {isLoading ? (
                <View style={[s.loadingBox, { backgroundColor: C.dangerLight, borderColor: C.danger + '44' }]}>
                  <ActivityIndicator size="small" color={C.danger} />
                  <Text style={[s.loadingText, { color: C.danger, fontFamily: Font.semiBold }]}>
                    {statusLabel || 'Deleting…'}
                  </Text>
                </View>
              ) : (
                <View style={s.btnRow}>
                  <TouchableOpacity
                    style={[s.btn, { borderColor: C.border }]}
                    onPress={() => setStep(1)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Go Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: C.danger, borderColor: C.danger }]}
                    onPress={onConfirm}
                    activeOpacity={0.85}
                  >
                    <Feather name="trash-2" size={15} color="#fff" />
                    <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>Delete Everything</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
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
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 17, lineHeight: 23 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  body:     { fontSize: 13, lineHeight: 20, marginBottom: 16 },

  // Bullets (step 1)
  bulletRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  bulletIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 18 },

  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 6, marginBottom: 22,
  },
  warnText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Final confirm box (step 2)
  finalWarnBox: {
    borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 22,
  },
  finalWarnTitle: { fontSize: 14, marginBottom: 6 },
  finalWarnSub:   { fontSize: 12, lineHeight: 18 },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnText: { fontSize: 14 },

  // Loading state
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  loadingText: { fontSize: 14, flex: 1 },
});
