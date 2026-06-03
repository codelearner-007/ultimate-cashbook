import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, Animated, Platform, Dimensions, Image } from 'react-native';
import { useAuthStore } from '../src/store/authStore';

const { width, height } = Dimensions.get('window');

const TEAL = '#39AAAA';
const TEAL_DARK = '#2B8080';

export default function Index() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // Animate the card in
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();

    // Navigate after 1.8 s
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
      <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* App icon */}
        <View style={s.iconWrap}>
          <Image
            source={require('../assets/icon.png')}
            style={s.icon}
            resizeMode="contain"
          />
        </View>

        {/* App name */}
        <Text style={s.appName}>Ultimate CashBook</Text>

        {/* Feature pills */}
        <View style={s.pillsRow}>
          {['Income', 'Expense', 'Reports'].map((label) => (
            <View key={label} style={s.pill}>
              <Text style={s.pillText}>{label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerText}>Developed by Devautobot</Text>
        <Text style={s.footerSub}>devautobot.com</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: width * 0.62,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: TEAL_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  icon: {
    width: 60,
    height: 60,
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  pillText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 28,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
});
