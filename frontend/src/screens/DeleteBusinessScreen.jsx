import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, TextInput, Alert,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { Font } from '../constants/fonts';

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const BUSINESS_NAME = "Farhan Ahmad's Business"; // TODO: pull from useBusinessProfile()

export default function DeleteBusinessScreen() {
  const router = useRouter();
  const { C, isDark }  = useTheme();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isMatch = confirm.trim() === BUSINESS_NAME;

  const handleDelete = () => {
    Alert.alert(
      'Delete Business',
      'This will permanently delete all books, entries, and data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            await new Promise(r => setTimeout(r, 800)); // TODO: replace with API call
            setDeleting(false);
            router.dismissAll();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Delete Business</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>

        {/* Warning card */}
        <View style={s.warningCard}>
          <View style={s.warningIconBox}>
            <Text style={s.warningIcon}>!</Text>
          </View>
          <Text style={s.warningTitle}>This action is irreversible</Text>
          <Text style={s.warningBody}>
            Deleting this business will permanently remove all books, entries, reports, and data associated with it. You will not be able to recover this data.
          </Text>
        </View>

        {/* Confirm input */}
        <View style={[s.confirmCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.confirmLabel, { color: C.textMuted }]}>
            Type <Text style={{ color: C.text, fontFamily: Font.bold }}>{BUSINESS_NAME}</Text> to confirm
          </Text>
          <TextInput
            style={[s.confirmInput, { color: C.text, borderColor: isMatch ? C.danger : C.border, fontFamily: Font.regular }]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type business name here"
            placeholderTextColor={C.textSubtle}
            underlineColorAndroid="transparent"
            autoCorrect={false}
          />
        </View>

        {/* Delete button */}
        <TouchableOpacity
          style={[s.deleteBtn, { opacity: isMatch && !deleting ? 1 : 0.4 }]}
          onPress={handleDelete}
          disabled={!isMatch || deleting}
          activeOpacity={0.85}
        >
          <Text style={s.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete Business'}</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.background },
  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  content: { padding: 16, paddingTop: 24, gap: 16 },

  warningCard: {
    backgroundColor: C.dangerLight, borderRadius: 16,
    borderWidth: 1, borderColor: C.danger,
    padding: 20, alignItems: 'center',
  },
  warningIconBox: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  warningIcon:  { fontSize: 22, fontFamily: Font.extraBold, color: '#fff', lineHeight: 28 },
  warningTitle: { fontSize: 16, fontFamily: Font.bold, color: C.danger, marginBottom: 8, textAlign: 'center' },
  warningBody:  { fontSize: 13, fontFamily: Font.regular, color: C.danger, lineHeight: 20, textAlign: 'center' },

  confirmCard:   { borderRadius: 16, borderWidth: 1, padding: 16 },
  confirmLabel:  { fontSize: 13, fontFamily: Font.regular, lineHeight: 20, marginBottom: 12 },
  confirmInput: {
    borderWidth: 1.5, borderRadius: 10, padding: 14,
    fontSize: 14, lineHeight: 20,
  },

  deleteBtn: {
    backgroundColor: C.danger, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  deleteBtnText: { fontSize: 15, fontFamily: Font.bold, color: '#fff' },
});
