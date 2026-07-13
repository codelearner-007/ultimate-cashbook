import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

// Shared "you're offline, can't sync" alert — shown whenever a paid/superadmin
// user taps Upload to Cloud / Restore from Cloud / a book's Sync action while
// offline. Same visual pattern as BackupSyncScreen's "Nothing to sync" alert.
export default function OfflineSyncModal({ visible, onDismiss }) {
  const { C, Font } = useTheme();

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={[st.backdrop, { backgroundColor: C.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <View style={[st.box, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={[st.iconWrap, { backgroundColor: C.primaryLight }]}>
            <Feather name="wifi-off" size={28} color={C.primary} />
          </View>
          <Text style={[st.title, { color: C.text, fontFamily: Font.bold }]}>You're offline</Text>
          <Text style={[st.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            Syncing to the cloud needs an internet connection. Turn on WiFi or
            mobile data and try again.
          </Text>
          <TouchableOpacity
            style={[st.btn, { backgroundColor: C.primary }]}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <Text style={[st.btnText, { fontFamily: Font.bold }]}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  box: {
    width: '100%', borderRadius: 20, borderWidth: 1.5,
    padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title:   { fontSize: 18, marginBottom: 8 },
  body:    { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  btn:     { width: '100%', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, color: '#fff' },
});
