import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Dimensions, Modal, ActivityIndicator, Alert, TextInput,
  Keyboard, Animated, Platform, Image,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import Svg, { Path, Circle } from 'react-native-svg';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { LightColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  forceCodeForRefreshToken: true,
});

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


function BackgroundBlobs() {
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      <Circle cx={width * 0.85} cy={height * 0.08}  r={160} fill="rgba(255,255,255,0.08)" />
      <Circle cx={width * 0.0}  cy={height * 0.35}  r={100} fill="rgba(255,255,255,0.06)" />
      <Circle cx={width * 0.6}  cy={height * 0.88}  r={180} fill="rgba(255,255,255,0.06)" />
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
      // Production path: custom backend sends OTP via Gmail SMTP.
      // Backend returns 503 when GMAIL_SMTP_USER is not set (local dev),
      // in which case we fall back to Supabase native OTP → Inbucket.
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (res.status === 503) {
        // Dev fallback — Supabase native OTP (goes to Inbucket on port 54324)
        const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
        if (error) throw new Error(error.message);
        setStep('otp');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to send OTP. Try again.');
      }

      setStep('otp');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not send OTP. Check your connection.');
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
        // Dev fallback — verify via Supabase native OTP
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

      // Hydrate the Supabase client with the new session so all subsequent
      // API calls (via api.js interceptor) carry the correct JWT.
      await supabase.auth.setSession({ access_token, refresh_token });

      // Fetch full profile from backend (role, subscription_tier, etc.)
      const profile = await apiGetProfile();
      useAuthStore.getState().setUser(profile, { access_token, refresh_token });

      reset();
      onClose();
      // AuthGuard in _layout.jsx will redirect based on profile.role
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
      {/* Dim backdrop */}
      <View style={[StyleSheet.absoluteFill, styles.pickerOverlay]} pointerEvents="box-none">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { Keyboard.dismiss(); reset(); onClose(); }} />
      </View>

      {/* Sheet anchored to bottom; lifts above keyboard via marginBottom */}
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
                  <EmailTextInput value={email} onChangeText={setEmail} />
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

function EmailTextInput({ value, onChangeText }) {
  return (
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChangeText}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      placeholder="you@example.com"
      placeholderTextColor={C.textMuted}
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [loading,    setLoading]    = useState(false);
  const [showEmail,  setShowEmail]  = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      // Always sign out first so Google presents the account picker every time.
      await GoogleSignin.signOut().catch(() => {});
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken ?? userInfo.idToken;
      if (!idToken) throw new Error('No ID token returned from Google');

      // Pass the Google ID token to Supabase — this fires onAuthStateChange(SIGNED_IN)
      // in _layout.jsx which fetches the profile and calls setUser automatically.
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;
      // AuthGuard in _layout.jsx redirects based on role after setUser runs.
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
      <StatusBar barStyle="light-content" backgroundColor="#39AAAA" />
      <BackgroundBlobs />

      <View style={styles.container}>

        {/* Single centered card */}
        <View style={styles.card}>
          {/* Logo */}
          <View style={styles.logoCircle}>
            <Image
              source={require('../../assets/logo1.jpg')}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>

          <Text style={styles.appName}>Ultimate CashBook</Text>
          <Text style={styles.tagline}>Smart money tracking for your business</Text>

          <View style={styles.divider} />

          {/* Google */}
          <TouchableOpacity
            style={[styles.googleBtn, loading && { opacity: 0.6 }]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.82}
          >
            <View style={styles.iconSlot}>
              {loading ? <ActivityIndicator size="small" color={C.primary} /> : <GoogleIcon size={20} />}
            </View>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          <TouchableOpacity style={styles.emailBtn} onPress={() => setShowEmail(true)} activeOpacity={0.82}>
            <EmailIcon size={18} color={C.primary} />
            <Text style={styles.emailBtnText}>Continue with Email</Text>
          </TouchableOpacity>

          {/* Terms */}
          <Text style={styles.terms}>
            By continuing, you agree to our{' '}
            <Text style={styles.link}>Terms</Text>
            {' '}&amp;{' '}
            <Text style={styles.link}>Privacy Policy</Text>
          </Text>
        </View>

        {/* Developer credit */}
        <Text style={styles.devCredit}>Developed by Devenslab</Text>

      </View>

      <EmailModal visible={showEmail} onClose={() => setShowEmail(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  card: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 24,
    padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15, shadowRadius: 32, elevation: 12,
  },

  logoCircle: {
    width: 88, height: 88, borderRadius: 22, marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  logoImage: { width: '100%', height: '100%' },

  appName: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 4, textAlign: 'center' },
  tagline:  { fontSize: 13, color: 'rgba(255,255,255,0.80)', textAlign: 'center', letterSpacing: 0.1 },

  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 20 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: '#fff', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  iconSlot:      { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  googleBtnText: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.text, marginRight: 34 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.30)' },
  dividerText: { fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '500' },

  emailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, gap: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.50)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  emailBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  terms: { fontSize: 11, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 16, marginTop: 18, paddingHorizontal: 4 },
  link:  { color: '#fff', fontWeight: '600' },

  devCredit: { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 24, textAlign: 'center' },

  // Email modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetAnchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  pickerBox: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12, paddingBottom: 36,
  },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  pickerTitle:  { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 4 },
  pickerSub:    { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 20 },
  pickerCancel: { marginTop: 12, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' },
  pickerCancelText: { fontSize: 15, fontWeight: '600', color: C.textMuted },

  inputBox: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  textInput: {
    height: 48, borderWidth: 1.5, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 15, color: C.text, backgroundColor: C.background,
  },
  sendBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  otpInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8 },
});
