import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { useAuthStore } from '../src/store/authStore';

const { width, height } = Dimensions.get('window');

const BG = '#EEF7F7';
const PRIMARY = '#39AAAA';
const TEXT = '#0F172A';
const TEXT_MUTED = '#64748B';
const TEXT_SUBTLE = '#94A3B8';

function BackgroundBlobs() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Ellipse cx={width * 0.92} cy={height * 0.06} rx={140} ry={130} fill="rgba(57,170,170,0.14)" />
      <Ellipse cx={0} cy={height * 0.36} rx={100} ry={95} fill="rgba(57,170,170,0.10)" />
      <Ellipse cx={-30} cy={height + 30} rx={160} ry={150} fill="rgba(57,170,170,0.55)" />
      <Ellipse cx={width + 20} cy={height - 20} rx={120} ry={115} fill="rgba(57,170,170,0.35)" />
    </Svg>
  );
}

export default function Index() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      if (!user) {
        router.replace('/(auth)/login');
      } else if (user.role === 'superadmin') {
        router.replace('/(app)/dashboard/users');
      } else {
        router.replace('/(app)/books');
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={s.root}>
      <BackgroundBlobs />

      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* Logo */}
        <View style={s.logoBorder}>
          <View style={s.logoCircle}>
            <Image
              source={require('../assets/logo1.jpg')}
              style={s.logoImage}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* App name + tagline */}
        <Text style={s.appName}>Ultimate CashBook</Text>
        <Text style={s.tagline}>Smart money tracking for your business</Text>

        {/* Dev credit */}
        <View style={s.devRow}>
          <Text style={s.devCredit}>
            Developed by <Text style={s.devName}>DevAutoBot</Text>
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoBorder: {
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 3,
    borderColor: 'rgba(57,170,170,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 8,
  },
  logoImage: { width: '100%', height: '100%' },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    letterSpacing: 0.1,
    marginBottom: 40,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devCredit: { fontSize: 12, color: TEXT_SUBTLE, fontWeight: '400' },
  devName: { fontSize: 12, color: PRIMARY, fontWeight: '700', letterSpacing: 0.2 },
});
