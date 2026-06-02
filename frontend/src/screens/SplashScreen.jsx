import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Font } from '../constants/fonts';

const { width, height } = Dimensions.get('window');

// Matches the gradient teal background in splash.png exactly
const BG_TOP    = '#2AADA8';
const BG_BOTTOM = '#1E8A87';

export default function SplashScreen({ onFinish }) {
  const cardScale   = useRef(new Animated.Value(0.82)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(18)).current;
  const screenOp    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Card springs in
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Text fades up after card lands
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // 3. Hold then fade entire screen out
    Animated.sequence([
      Animated.delay(2400),
      Animated.timing(screenOp, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onFinish) onFinish();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[s.root, { opacity: screenOp }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG_TOP} />

      {/* Teal gradient background — two-layer approximation */}
      <View style={s.bgTop} />
      <View style={s.bgBottom} />

      {/* Glassmorphism card */}
      <Animated.View
        style={[
          s.card,
          { opacity: cardOpacity, transform: [{ scale: cardScale }] },
        ]}
      >
        {/* App icon */}
        <Image
          source={require('../../assets/icon.png')}
          style={s.icon}
          resizeMode="contain"
        />

        {/* Dash below icon */}
        <View style={s.dash} />

        {/* App name + tagline */}
        <Animated.View
          style={{ alignItems: 'center', opacity: textOpacity, transform: [{ translateY: textY }] }}
        >
          <Text style={s.appName}>Ultimate CashBook</Text>
          <Text style={s.tagline}>Smart money tracking for your business</Text>

          {/* Feature chips */}
          <View style={s.chipsRow}>
            {['Income', 'Expense', 'Reports'].map((label) => (
              <View key={label} style={s.chip}>
                <Text style={s.chipText}>{label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>

      {/* Footer */}
      <Animated.View style={[s.footer, { opacity: textOpacity }]}>
        <Text style={s.footerTop}>Developed by Devautobot</Text>
        <Text style={s.footerSub}>devautobot.com</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Two-rect gradient approximation (no extra library needed)
  bgTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_TOP,
    bottom: height * 0.45,
  },
  bgBottom: {
    ...StyleSheet.absoluteFillObject,
    top: height * 0.55,
    backgroundColor: BG_BOTTOM,
  },
  // Middle blend
  // (the teal is close enough that a solid mid-tone covers the seam)

  // Glassmorphism card
  card: {
    width: width * 0.78,
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 28,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    // soft glow shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },

  icon: {
    width: 96,
    height: 96,
    borderRadius: 22,
    marginBottom: 14,
  },

  dash: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.40)',
    marginBottom: 16,
  },

  appName: {
    fontSize: 22,
    fontFamily: Font.extraBold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginBottom: 6,
    textAlign: 'center',
  },

  tagline: {
    fontSize: 12,
    fontFamily: Font.regular,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.1,
  },

  chipsRow: {
    flexDirection: 'row',
    gap: 10,
  },

  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  chipText: {
    fontSize: 12,
    fontFamily: Font.semiBold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },

  footerTop: {
    fontSize: 12,
    fontFamily: Font.medium,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 0.2,
  },

  footerSub: {
    fontSize: 11,
    fontFamily: Font.regular,
    color: 'rgba(255,255,255,0.40)',
    marginTop: 2,
    letterSpacing: 0.1,
  },
});
