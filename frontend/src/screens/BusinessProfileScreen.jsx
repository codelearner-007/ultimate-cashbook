import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Alert,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { Font } from '../constants/fonts';
import AppInput from '../components/ui/Input';

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

// Mock business data — replace with useBusinessProfile() hook when API is ready
const MOCK_BUSINESS = {
  name: "Farhan Ahmad's Business",
  phone: '',
  address: '',
  email: '',
};


export default function BusinessProfileScreen() {
  const router = useRouter();
  const { C, isDark }  = useTheme();

  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [address, setAddress] = useState('');
  const [email,   setEmail]   = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    // TODO: replace with useBusinessProfile() hook data
    setName(MOCK_BUSINESS.name);
    setPhone(MOCK_BUSINESS.phone);
    setAddress(MOCK_BUSINESS.address);
    setEmail(MOCK_BUSINESS.email);
  }, []);

  const isDirty =
    name    !== MOCK_BUSINESS.name    ||
    phone   !== MOCK_BUSINESS.phone   ||
    address !== MOCK_BUSINESS.address ||
    email   !== MOCK_BUSINESS.email;

  const handleUpdate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 600)); // TODO: replace with API call
    setSaving(false);
    Alert.alert('Business Updated', 'Your business profile has been saved.');
  };

  const initials = name.trim()
    ? name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'B';

  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Business Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* Avatar */}
        <View style={[s.avatarCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={[s.avatar, { backgroundColor: C.primary }]}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>
          <Text style={[s.bizName,  { color: C.text }]}>{name || 'Business Name'}</Text>
          <Text style={[s.bizEmail, { color: C.textMuted }]}>{email || 'No email set'}</Text>
        </View>

        {/* Fields */}
        <View style={s.sectionWrap}>
          <Text style={[s.sectionLabel, { color: C.textMuted }]}>BUSINESS DETAILS</Text>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <AppInput label="Business Name"  value={name}    onChangeText={setName}    placeholder="Enter business name" />
            <AppInput label="Business Email" value={email}   onChangeText={setEmail}   placeholder="business@email.com" keyboardType="email-address" />
            <AppInput label="Phone Number"   value={phone}   onChangeText={setPhone}   placeholder="+92 300 0000000" keyboardType="phone-pad" />
            <AppInput label="Address"        value={address} onChangeText={setAddress} placeholder="Street, City" isLast />
          </View>
        </View>

        <View style={s.btnWrap}>
          <TouchableOpacity
            style={[s.updateBtn, { backgroundColor: C.primary, opacity: isDirty && !saving ? 1 : 0.4 }]}
            onPress={handleUpdate}
            disabled={!isDirty || saving}
            activeOpacity={0.85}
          >
            <Text style={s.updateBtnText}>{saving ? 'Saving…' : 'Update Business'}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  avatarCard: {
    alignItems: 'center', marginHorizontal: 16, borderRadius: 20,
    paddingVertical: 24, marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 6, borderWidth: 1,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  avatarInitials: { fontSize: 26, fontFamily: Font.extraBold, color: '#fff' },
  bizName:  { fontSize: 17, fontFamily: Font.bold,    marginBottom: 3 },
  bizEmail: { fontSize: 13, fontFamily: Font.regular },

  sectionWrap:  { marginHorizontal: 16, marginTop: 24, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 2 },
  card:         { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },

  btnWrap:       { marginHorizontal: 16, marginTop: 8 },
  updateBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  updateBtnText: { fontSize: 15, fontFamily: Font.bold, color: '#fff' },
});
