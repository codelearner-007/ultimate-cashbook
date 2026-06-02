import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Font } from '../constants/fonts';

const { width, height } = Dimensions.get('window');

const PILL_BG = 'rgba(0,0,0,0.22)';

export default function SplashScreen({ onFinish }) {
  const logoScale   = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(16)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo fades + scales in
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Text fades up after logo lands
    Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Fade out and call onFinish after ~2.6s
    Animated.sequence([
      Animated.delay(2600),
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onFinish) onFinish();
    });
  }, []);

  return (
    <Animated.View style={[s.root, { opacity: screenOpacity }]}>
      {/* Full-screen logo background */}
      <Image
        source={require('../../assets/logo1.jpg')}
        style={s.bgImage}
        resizeMode="cover"
      />

      {/* Centered logo with entrance animation */}
      <Animated.Image
        source={require('../../assets/logo1.jpg')}
        style={[
          s.logo,
          { transform: [{ scale: logoScale }], opacity: logoOpacity },
        ]}
        resizeMode="contain"
      />

      {/* App name pill at bottom */}
      <Animated.View
        style={[s.textWrap, { opacity: textOpacity, transform: [{ translateY: textY }] }]}
      >
        <View style={s.pill}>
          <Text style={s.pillText}>Ultimate CashBook</Text>
        </View>
        <Text style={s.tagline}>Smart money tracking for your business</Text>
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
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width,
    height,
  },
  logo: {
    width: width * 0.68,
    height: width * 0.68,
  },
  textWrap: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    backgroundColor: PILL_BG,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  pillText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontFamily: Font.bold,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: Font.regular,
    letterSpacing: 0.2,
  },
});
