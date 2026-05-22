import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

const SPARKLE_N = 8;

// Draws the classic two-arrow sync icon using plain Views (no icon library needed).
// Two curved arrow "arms" — top-right and bottom-left — as thick rounded stubs with arrowheads.
function SyncArrows({ color, size = 40 }) {
  const u = size / 40; // scale unit
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Top-right arrow arm */}
      <View style={{
        position: 'absolute',
        top: u * 4, right: u * 2,
        width: u * 18, height: u * 8,
        borderTopWidth: u * 5, borderRightWidth: u * 5,
        borderColor: color, borderTopRightRadius: u * 10,
      }} />
      {/* Top-right arrowhead pointing right */}
      <View style={{
        position: 'absolute',
        top: u * 1, right: u * 0,
        width: 0, height: 0,
        borderLeftWidth: u * 7, borderTopWidth: u * 5, borderBottomWidth: u * 5,
        borderLeftColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent',
      }} />
      {/* Bottom-left arrow arm */}
      <View style={{
        position: 'absolute',
        bottom: u * 4, left: u * 2,
        width: u * 18, height: u * 8,
        borderBottomWidth: u * 5, borderLeftWidth: u * 5,
        borderColor: color, borderBottomLeftRadius: u * 10,
      }} />
      {/* Bottom-left arrowhead pointing left */}
      <View style={{
        position: 'absolute',
        bottom: u * 1, left: u * 0,
        width: 0, height: 0,
        borderRightWidth: u * 7, borderTopWidth: u * 5, borderBottomWidth: u * 5,
        borderRightColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent',
      }} />
    </View>
  );
}

export default function SuccessDialog({ visible, onDismiss, title, subtitle, spinIcon }) {
  const { C, Font } = useTheme();

  const cardScale    = useRef(new Animated.Value(0.5)).current;
  const circleScale  = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale    = useRef(new Animated.Value(1)).current;
  const ringOpacity  = useRef(new Animated.Value(0.8)).current;
  const sparkleAnims = useRef(
    Array.from({ length: SPARKLE_N }, () => new Animated.Value(0))
  ).current;

  // Spinning icon animation
  const iconRotate  = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const spinDeg = iconRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    if (!visible) return;

    cardScale.setValue(0.5);
    circleScale.setValue(0);
    checkOpacity.setValue(0);
    ringScale.setValue(1);
    ringOpacity.setValue(0.8);
    iconRotate.setValue(0);
    iconOpacity.setValue(0);
    sparkleAnims.forEach(a => a.setValue(0));

    Animated.spring(cardScale, {
      toValue: 1, tension: 220, friction: 9, useNativeDriver: true,
    }).start(() => {
      Animated.spring(circleScale, {
        toValue: 1, tension: 260, friction: 7, useNativeDriver: true,
      }).start(() => {
        Animated.timing(checkOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();

        if (spinIcon) {
          Animated.timing(iconOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
          Animated.loop(
            Animated.timing(iconRotate, { toValue: 1, duration: 900, useNativeDriver: true })
          ).start();
        }

        Animated.loop(
          Animated.parallel([
            Animated.timing(ringScale,   { toValue: 1.55, duration: 850, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0,    duration: 850, useNativeDriver: true }),
          ])
        ).start();

        Animated.parallel(
          sparkleAnims.map((a, i) =>
            Animated.sequence([
              Animated.delay(i * 65),
              Animated.loop(
                Animated.sequence([
                  Animated.timing(a, { toValue: 1,    duration: 300, useNativeDriver: true }),
                  Animated.timing(a, { toValue: 0.08, duration: 300, useNativeDriver: true }),
                ])
              ),
            ])
          )
        ).start();
      });
    });

    const t = setTimeout(onDismiss, 2800);
    return () => {
      clearTimeout(t);
      [cardScale, circleScale, checkOpacity, ringScale, ringOpacity,
        iconRotate, iconOpacity, ...sparkleAnims].forEach(a => a.stopAnimation());
    };
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={s.bg}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onDismiss} activeOpacity={1} />

        <Animated.View style={[s.card, { backgroundColor: C.card, transform: [{ scale: cardScale }] }]}>

          <View style={s.sparkleArea}>
            {sparkleAnims.map((anim, i) => {
              const angle = (i / SPARKLE_N) * Math.PI * 2 - Math.PI / 2;
              const R     = 57;
              const size  = i % 2 === 0 ? 9 : 6;
              const color = i % 3 === 0 ? '#22C55E' : i % 3 === 1 ? '#16A34A' : '#4ADE80';
              return (
                <Animated.View
                  key={i}
                  style={{
                    position:        'absolute',
                    left:            70 + Math.cos(angle) * R - size / 2,
                    top:             70 + Math.sin(angle) * R - size / 2,
                    width:           size,
                    height:          size,
                    backgroundColor: color,
                    borderRadius:    1,
                    opacity:         anim,
                    transform:       [{ rotate: '45deg' }, { scale: anim }],
                  }}
                />
              );
            })}

            <Animated.View style={[s.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />

            <Animated.View style={[s.circle, { transform: [{ scale: circleScale }] }]}>
              <Animated.Text style={[s.checkText, { opacity: checkOpacity }]}>✓</Animated.Text>
            </Animated.View>
          </View>

          <Text style={[s.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>

          {spinIcon && (
            <Animated.View style={{ opacity: iconOpacity, transform: [{ rotate: spinDeg }], marginBottom: 8 }}>
              <SyncArrows color={spinIcon} size={32} />
            </Animated.View>
          )}

          <Text style={[s.sub, { color: C.textMuted, fontFamily: Font.regular }]}>{subtitle}</Text>

        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: 280, borderRadius: 24, paddingBottom: 32, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22, shadowRadius: 28, elevation: 24,
  },
  sparkleArea: {
    width: 140, height: 140,
    marginTop: 28, marginBottom: 16,
    position: 'relative', alignSelf: 'center',
  },
  ring: {
    position: 'absolute', left: 30, top: 30,
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2.5, borderColor: '#22C55E',
  },
  circle: {
    position: 'absolute', left: 30, top: 30,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#16A34A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
  },
  checkText: { fontSize: 40, color: '#fff', textAlign: 'center', lineHeight: 50 },
  title: { fontSize: 20, marginBottom: 8, letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 20 },
  sub:   { fontSize: 13, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
