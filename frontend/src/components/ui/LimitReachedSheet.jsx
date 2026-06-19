import React, { useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { Font } from '../../constants/fonts';

/**
 * Bottom sheet shown whenever a user hits a plan limit.
 *
 * Props:
 *   visible        — bool
 *   onDismiss      — () => void
 *   limitType      — 'books' | 'shares'
 *   currentLimit   — number   (e.g. 3 for free books, 1 for pro sharing)
 *   currentTier    — 'free' | 'pro' | 'business'
 */
export default function LimitReachedSheet({ visible, onDismiss, limitType = 'books', currentLimit, currentTier = 'free' }) {
  const { C } = useTheme();
  const router   = useRouter();
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 500, duration: 200, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, bgOpacity]);

  const close = useCallback(() => animClose(onDismiss), [animClose, onDismiss]);

  const handleUpgrade = useCallback(() => {
    animClose(() => {
      onDismiss?.();
      router.push('/(app)/settings/subscription');
    });
  }, [animClose, onDismiss, router]);

  if (!visible) return null;

  const isBooks  = limitType === 'books';
  const isShares = limitType === 'shares';

  // Copy
  const icon        = isBooks ? 'book' : 'users';
  const emoji       = isBooks ? '📚' : '👥';
  const title       = isBooks ? 'Book Limit Reached' : 'Sharing Limit Reached';
  const description = isBooks
    ? `Your ${tierLabel(currentTier)} plan includes up to ${currentLimit} cashbook${currentLimit !== 1 ? 's' : ''}. You've used all of them.`
    : `Your ${tierLabel(currentTier)} plan allows sharing with up to ${currentLimit} guest${currentLimit !== 1 ? 's' : ''}. You've reached your limit.`;

  const upgradeTarget = currentTier === 'pro' ? 'Business' : 'Pro';
  const upgradeDesc   = isBooks
    ? upgradeTarget === 'Pro' ? 'Get up to 15 cashbooks' : 'Get unlimited cashbooks'
    : upgradeTarget === 'Pro' ? 'Share with 1 guest'     : 'Share with up to 10 guests';

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Icon */}
          <View style={[s.iconWrap, { backgroundColor: '#F59E0B1A' }]}>
            <Text style={s.emoji}>{emoji}</Text>
          </View>

          {/* Title + description */}
          <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>
          <Text style={[s.desc, { color: C.textMuted, fontFamily: Font.regular }]}>{description}</Text>

          {/* Upgrade card */}
          <View style={[s.upgradeCard, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B44' }]}>
            <View style={[s.upgradeIconBox, { backgroundColor: '#F59E0B22' }]}>
              <Feather name="zap" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.upgradeTier, { color: '#92400E', fontFamily: Font.bold }]}>
                Upgrade to {upgradeTarget}
              </Text>
              <Text style={[s.upgradeDesc, { color: '#92400E', fontFamily: Font.regular }]}>
                {upgradeDesc}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, { borderColor: C.border }]}
              onPress={close}
              activeOpacity={0.8}
            >
              <Text style={[s.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Maybe Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, s.btnFill, { backgroundColor: '#F59E0B' }]}
              onPress={handleUpgrade}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 14, marginRight: 6 }}>👑</Text>
              <Text style={[s.btnText, { color: '#fff', fontFamily: Font.bold }]}>View Plans</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function tierLabel(tier) {
  if (tier === 'pro')      return 'Pro';
  if (tier === 'business') return 'Business';
  return 'Free';
}

const s = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
    alignItems: 'center',
  },
  handle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  iconWrap:  { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emoji:     { fontSize: 38 },
  title:     { fontSize: 20, textAlign: 'center', marginBottom: 10, letterSpacing: 0.2 },
  desc:      { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22, paddingHorizontal: 8 },

  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: 16, paddingVertical: 14,
    width: '100%', marginBottom: 24,
  },
  upgradeIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  upgradeTier:    { fontSize: 14, marginBottom: 3 },
  upgradeDesc:    { fontSize: 12, lineHeight: 18 },

  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
  },
  btnFill:  { borderWidth: 0 },
  btnText:  { fontSize: 14 },
});
