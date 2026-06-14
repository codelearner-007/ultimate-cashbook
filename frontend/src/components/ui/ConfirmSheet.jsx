import { useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, Keyboard, Platform, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Shared animated bottom-sheet confirmation scaffold.
 *
 * Renders the dim backdrop, absolute-bottom anchor, handle bar, rounded-top
 * sheet, header (icon + title + subtitle), body, and a Cancel/Confirm button
 * row. Used by all the confirm sheets (Delete*, Logout, LeaveBook, …) so the
 * animation + layout live in exactly one place.
 *
 * Props:
 *   visible          — controls visibility (sheet returns null when false)
 *   onDismiss        — called after the sheet animates closed (cancel / backdrop)
 *   onConfirm        — called when the confirm button is tapped
 *   title            — header title text
 *   subtitle         — header subtitle text (defaults to "This cannot be undone")
 *   message          — body text (string); ignored if `children` is provided
 *   children         — custom body content (rich text, preview cards, inputs …)
 *   confirmLabel     — confirm button label
 *   loadingLabel     — confirm button label while `isLoading` is true
 *   cancelLabel      — cancel button label (default "Cancel")
 *   danger           — true → C.danger styling on icon + confirm (default true)
 *   isLoading        — show spinner on confirm button
 *   confirmDisabled  — disable confirm button (e.g. type-to-confirm gate)
 *   confirmOpacity   — explicit opacity for the confirm button (overrides default)
 *   cancelDisabled   — disable cancel button while loading
 *   icon             — header icon name (Feather)
 *   confirmIcon      — confirm button icon name (Feather); defaults to `icon`
 *   footer           — custom footer node; replaces the Cancel/Confirm row entirely
 *   hideHeader       — true → omit the icon/title/subtitle header row (custom layouts)
 *   keyboardAware    — true → wrap the sheet in the keyboard-offset pattern
 *   closeRef         — ref; `.current` is set to the animateClose(callback) fn
 *   onBeforeClose    — optional side-effect run on close (e.g. Keyboard.dismiss())
 *   C, Font          — theme tokens
 */
export default function ConfirmSheet({
  visible,
  onDismiss,
  onConfirm,
  title,
  subtitle = 'This cannot be undone',
  message,
  children,
  confirmLabel,
  loadingLabel,
  cancelLabel = 'Cancel',
  danger = true,
  isLoading = false,
  confirmDisabled = false,
  confirmOpacity,
  cancelDisabled = false,
  icon = 'trash-2',
  confirmIcon,
  footer,
  hideHeader = false,
  headerStyle,
  bodyStyle,
  keyboardAware = false,
  closeRef,
  onBeforeClose,
  C,
  Font,
}) {
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  // Non-native driver — drives marginBottom, not transform
  const kbOffset  = useRef(new Animated.Value(0)).current;

  // Keyboard listeners — move sheet above keyboard, return flush on dismiss
  useEffect(() => {
    if (!keyboardAware) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up = Keyboard.addListener(showEvent, (e) =>
      Animated.timing(kbOffset, { toValue: e.endCoordinates.height, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
    );
    const down = Keyboard.addListener(hideEvent, (e) =>
      Animated.timing(kbOffset, { toValue: 0, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
    );
    return () => { up.remove(); down.remove(); };
  }, [keyboardAware]);

  const animateClose = useCallback((callback) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => callback?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (closeRef) closeRef.current = animateClose;
  }, [closeRef, animateClose]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = () => {
    onBeforeClose?.();
    animateClose(onDismiss);
  };

  if (!visible) return null;

  const accent       = danger ? C.danger : C.primary;
  const resolvedConfirmIcon = confirmIcon ?? icon;
  const effectiveOpacity = confirmOpacity != null
    ? confirmOpacity
    : (isLoading ? 0.6 : 1);

  const sheetInner = (
    <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
      <View style={[s.handle, { backgroundColor: C.border }]} />

      {!hideHeader && (
        <View style={[s.headerRow, headerStyle]}>
          <View style={[s.iconCircle, { backgroundColor: accent, shadowColor: accent }]}>
            <Feather name={icon} size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>
            <Text style={[s.subtitle, { color: accent, fontFamily: Font.medium }]}>
              {subtitle}
            </Text>
          </View>
        </View>
      )}

      {children != null ? children : (
        <Text style={[s.body, bodyStyle, { color: C.textMuted, fontFamily: Font.regular }]}>
          {message}
        </Text>
      )}

      {footer != null ? footer : (
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, { borderColor: C.border }]}
            onPress={close}
            activeOpacity={0.8}
            disabled={cancelDisabled}
          >
            <Text style={[s.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>{cancelLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnConfirm, { backgroundColor: accent, opacity: effectiveOpacity }]}
            onPress={() => !confirmDisabled && !isLoading && onConfirm()}
            disabled={confirmDisabled || isLoading}
            activeOpacity={0.85}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name={resolvedConfirmIcon} size={15} color="#fff" />
            }
            <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>
              {isLoading ? loadingLabel : confirmLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop — absolutely positioned, independent of sheet layout */}
      <Animated.View style={[StyleSheet.absoluteFill, s.dimBg, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet anchor: absolute bottom */}
      <View style={s.anchor} pointerEvents="box-none">
        {keyboardAware ? (
          // kbOffset uses non-native driver (marginBottom); slideY (native) sits on the inner view
          <Animated.View style={{ marginBottom: kbOffset }}>
            {sheetInner}
          </Animated.View>
        ) : (
          sheetInner
        )}
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
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title:    { fontSize: 16, lineHeight: 22 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  body:     { fontSize: 13, lineHeight: 19, marginBottom: 20, paddingHorizontal: 2 },
  btnRow:   { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnConfirm: { borderWidth: 0 },
  btnText:    { fontSize: 14 },
});
