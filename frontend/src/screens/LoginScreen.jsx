import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Dimensions, Modal, ActivityIndicator, Alert, TextInput,
  Keyboard, Animated, Platform, Image, ScrollView,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import Svg, { Path, Ellipse } from 'react-native-svg';
import Constants from 'expo-constants';
import { LightColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { apiGetProfile } from '../lib/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Google Sign-In is a native module — unavailable in Expo Go
const IS_EXPO_GO = Constants.appOwnership === 'expo';

let GoogleSignin = null;
let statusCodes = {};
if (!IS_EXPO_GO) {
  const gs = require('@react-native-google-signin/google-signin');
  GoogleSignin = gs.GoogleSignin;
  statusCodes = gs.statusCodes;
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    forceCodeForRefreshToken: true,
  });
}

const C = LightColors;
const { width, height } = Dimensions.get('window');

// ── Icons ─────────────────────────────────────────────────────────────────────

function GoogleIcon({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  );
}

function EmailIcon({ size = 18, color = C.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 6l-10 7L2 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Decorative teal blobs matching the screenshot
function BackgroundBlobs() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      {/* Top-right large blob */}
      <Ellipse cx={width * 0.92} cy={height * 0.06} rx={140} ry={130} fill="rgba(57,170,170,0.14)" />
      {/* Left-middle smaller blob */}
      <Ellipse cx={0} cy={height * 0.36} rx={100} ry={95} fill="rgba(57,170,170,0.10)" />
      {/* Bottom-left large solid teal circle */}
      <Ellipse cx={-30} cy={height + 30} rx={160} ry={150} fill="rgba(57,170,170,0.55)" />
      {/* Bottom-right medium circle */}
      <Ellipse cx={width + 20} cy={height - 20} rx={120} ry={115} fill="rgba(57,170,170,0.35)" />
    </Svg>
  );
}

// ── Email OTP modal ────────────────────────────────────────────────────────────

function EmailModal({ visible, onClose }) {
  const [email,   setEmail]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [step,    setStep]    = useState('email'); // 'email' | 'otp'
  const [loading, setLoading] = useState(false);

  const kbOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up = Keyboard.addListener(showEvent, (e) =>
      Animated.timing(kbOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start()
    );
    const down = Keyboard.addListener(hideEvent, (e) =>
      Animated.timing(kbOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration : 150,
        useNativeDriver: false,
      }).start()
    );
    return () => { up.remove(); down.remove(); };
  }, [kbOffset]);

  const reset = () => { setEmail(''); setOtp(''); setStep('email'); };

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid Email', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 503) {
        // Fallback: Supabase native OTP (dev → Inbucket; prod → Supabase email service)
        const { error } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: { shouldCreateUser: true },
        });
        if (error) throw new Error(error.message);
        setStep('otp');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to send code. Try again.');
      }
      setStep('otp');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not send code. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const code = otp.trim();
    if (code.length !== 6) {
      Alert.alert('Invalid Code', 'Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      if (res.status === 503) {
        // Dev fallback: Supabase native verify
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code,
          type:  'email',
        });
        if (error) throw new Error(error.message);
        reset();
        onClose();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid or expired code.');
      }
      const { access_token, refresh_token } = await res.json();
      await supabase.auth.setSession({ access_token, refresh_token });
      const profile = await apiGetProfile();
      useAuthStore.getState().setUser(profile, { access_token, refresh_token });
      reset();
      onClose();
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => { reset(); onClose(); }}
    >
      <View style={[StyleSheet.absoluteFill, styles.pickerOverlay]} pointerEvents="box-none">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Keyboard.dismiss(); reset(); onClose(); }} />
      </View>
      <View style={styles.sheetAnchor} pointerEvents="box-none">
        <Animated.View style={{ marginBottom: kbOffset }}>
          <View style={styles.pickerBox}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>
              {step === 'email' ? 'Continue with Email' : 'Enter OTP Code'}
            </Text>
            {step === 'email' ? (
              <>
                <Text style={styles.pickerSub}>Enter your email to receive a sign-in code</Text>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="you@example.com"
                    placeholderTextColor={C.textMuted}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, loading && { opacity: 0.6 }]}
                  onPress={handleSend}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sendBtnText}>Send Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickerCancel} onPress={() => { reset(); onClose(); }}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.pickerSub}>
                  We sent a 6-digit code to {email}.{'\n'}Check your inbox and enter it below.
                </Text>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>6-Digit Code</Text>
                  <TextInput
                    style={[styles.textInput, styles.otpInput]}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={C.textMuted}
                    textAlign="center"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, loading && { opacity: 0.6 }]}
                  onPress={handleVerify}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sendBtnText}>Verify & Sign In</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickerCancel} onPress={() => setStep('email')}>
                  <Text style={styles.pickerCancelText}>← Change Email</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [loading,   setLoading]   = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!GoogleSignin) return;
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut().catch(() => {});
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken ?? userInfo.idToken;
      if (!idToken) throw new Error('No ID token returned from Google');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
    } catch (err) {
      if (
        err.code === statusCodes.SIGN_IN_CANCELLED ||
        err.code === statusCodes.IN_PROGRESS
      ) return;
      Alert.alert('Sign-in failed', err?.message || 'Could not connect. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#EEF7F7" />
      <BackgroundBlobs />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + branding above card */}
        <View style={styles.brandRow}>
          <View style={styles.logoBorder}>
            <View style={styles.logoCircle}>
              <Image
                source={require('../../assets/logo1.jpg')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
          </View>
          <Text style={styles.appName}>Ultimate CashBook</Text>
          <Text style={styles.tagline}>Smart money tracking for your business</Text>
        </View>

        {/* White login card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome</Text>
          <Text style={styles.cardSub}>Login or signup to backup your data securely</Text>

          {/* Google — hidden in Expo Go (native module not available) */}
          {!IS_EXPO_GO && (
            <>
              <TouchableOpacity
                style={[styles.googleBtn, loading && { opacity: 0.6 }]}
                onPress={handleGoogleSignIn}
                disabled={loading}
                activeOpacity={0.82}
              >
                <View style={styles.iconSlot}>
                  {loading
                    ? <ActivityIndicator size="small" color={C.primary} />
                    : <GoogleIcon size={20} />}
                </View>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          {/* Email */}
          <TouchableOpacity
            style={styles.emailBtn}
            onPress={() => setShowEmail(true)}
            activeOpacity={0.82}
          >
            <EmailIcon size={18} color={C.primary} />
            <Text style={styles.emailBtnText}>Continue with Email</Text>
          </TouchableOpacity>
        </View>

        {/* Terms — two lines matching screenshot */}
        <Text style={styles.terms}>
          {'By creating an account, you agree to our '}
          <Text style={styles.link}>Terms of Service</Text>
          {'\n'}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>


        {/* Developer credit */}
        <View style={styles.devPill}>
          <Text style={styles.devCredit}>Developed by <Text style={styles.devName}>DevAutoBot</Text></Text>
        </View>
      </ScrollView>

      <EmailModal visible={showEmail} onClose={() => setShowEmail(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EEF7F7' },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  // Branding
  brandRow: { alignItems: 'center', marginBottom: 24 },
  logoBorder: {
    width: 122, height: 122, borderRadius: 61,
    borderWidth: 3, borderColor: 'rgba(57,170,170,0.30)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20, shadowRadius: 12, elevation: 8,
  },
  logoImage: { width: '100%', height: '100%' },
  appName: {
    fontSize: 22, fontWeight: '800', color: C.primary,
    letterSpacing: 0.3, marginBottom: 4, textAlign: 'center',
  },
  tagline: {
    fontSize: 13, color: C.textMuted,
    textAlign: 'center', letterSpacing: 0.1,
  },

  // Card
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 5,
  },
  cardTitle: {
    fontSize: 24, fontWeight: '800', color: C.text,
    textAlign: 'center', marginBottom: 6,
  },
  cardSub: {
    fontSize: 13, color: C.textMuted,
    textAlign: 'center', marginBottom: 28, lineHeight: 20,
  },

  // Google button — white with border
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', backgroundColor: '#fff',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  iconSlot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  googleBtnText: {
    flex: 1, textAlign: 'center',
    fontSize: 15, fontWeight: '600', color: C.text, marginRight: 34,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 14, gap: 10, width: '100%',
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },

  // Email button — outlined teal
  emailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16, gap: 10,
    borderWidth: 1.5, borderColor: C.primary,
    backgroundColor: '#fff',
  },
  emailBtnText: { fontSize: 15, fontWeight: '600', color: C.primary },

  // Terms
  terms: {
    fontSize: 11, color: C.textMuted,
    textAlign: 'center', lineHeight: 18,
    marginTop: 16, paddingHorizontal: 8,
  },
  link: { color: C.primary, fontWeight: '600' },


  devPill: {
    marginTop: 28,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  devCredit: { fontSize: 12, color: C.textSubtle, fontWeight: '400' },
  devName: { fontSize: 12, color: C.primary, fontWeight: '700', letterSpacing: 0.2 },

  // Email modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetAnchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  pickerBox: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12, paddingBottom: 36,
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 20,
  },
  pickerTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4 },
  pickerSub: { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 20 },
  pickerCancel: {
    marginTop: 12, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border, alignItems: 'center',
  },
  pickerCancelText: { fontSize: 15, fontWeight: '600', color: C.textMuted },
  inputBox: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  textInput: {
    height: 48, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.background,
  },
  sendBtn: {
    backgroundColor: C.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  otpInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8 },
});
