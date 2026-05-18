import { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function LogoutSheet({ visible, onDismiss, onConfirm, isLoading, C, Font }) {
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
      Animated.spring(slideY, { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, bgOpacity]);

  const close = () => animateClose(onDismiss);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.dimBg, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[s.handle, { backgroundColor: C.border }]} />

          <View style={s.headerRow}>
            <View style={[s.iconCircle, { backgroundColor: C.danger, shadowColor: C.danger }]}>
              <Feather name="log-out" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>Logout</Text>
              <Text style={[s.subtitle, { color: C.danger, fontFamily: Font.medium }]}>
                You'll need to sign in again
              </Text>
            </View>
          </View>

          <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            Are you sure you want to logout? Your data is safely stored and will be available when you sign back in.
          </Text>

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
              style={[s.btn, s.btnDanger, { backgroundColor: C.danger, opacity: isLoading ? 0.6 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="log-out" size={15} color="#fff" />
              }
              <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>
                {isLoading ? 'Logging out…' : 'Logout'}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title:    { fontSize: 16, lineHeight: 22 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  body:     { fontSize: 13, lineHeight: 19, marginBottom: 22, paddingHorizontal: 2 },
  btnRow:   { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnDanger: { borderWidth: 0 },
  btnText:   { fontSize: 14 },
});
