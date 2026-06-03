import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, FlatList, Switch, Modal, TextInput,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const DEMO_CONTACTS = [
  { id: '1', name: 'Ali Khan',    phone: '+92 300 1234567' },
  { id: '2', name: 'Sara Ahmed',  phone: '+92 321 9876543' },
  { id: '3', name: 'Bilal Raza',  phone: '+92 333 5556677' },
];

export default function ContactSettingsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = makeStyles(C, Font);

  const [showField, setShowField] = React.useState(false);

  const [contacts, setContacts]       = useState(DEMO_CONTACTS);
  const [addVisible, setAddVisible]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newPhone, setNewPhone]       = useState('');

  const addContact = () => {
    const name = newName.trim();
    if (!name) return;
    setContacts(prev => [...prev, { id: Date.now().toString(), name, phone: newPhone.trim() }]);
    setNewName('');
    setNewPhone('');
    setAddVisible(false);
  };

  const removeContact = (cid) => {
    setContacts(prev => prev.filter(c => c.id !== cid));
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Contact Settings</Text>
        <TouchableOpacity
          style={s.addHeaderBtn}
          onPress={() => setAddVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="user-plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Show Field Toggle */}
            <View style={[s.toggleCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.toggleLeft}>
                <View style={[s.iconBox, { backgroundColor: C.primaryLight }]}>
                  <Feather name="eye" size={18} color={C.primary} />
                </View>
                <View>
                  <Text style={s.toggleLabel}>Show Contact Field</Text>
                  <Text style={s.toggleSub}>Display on entry form</Text>
                </View>
              </View>
              <Switch
                value={showField}
                onValueChange={setShowField}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Import */}
            <TouchableOpacity
              style={[s.importRow, { backgroundColor: C.card, borderColor: C.border }]}
              activeOpacity={0.75}
            >
              <View style={[s.iconBox, { backgroundColor: C.primaryLight }]}>
                <Feather name="download" size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.importLabel}>Import from Other Books</Text>
                <Text style={s.importSub}>Copy contacts from another book</Text>
              </View>
              <Feather name="chevron-right" size={18} color={C.textSubtle} />
            </TouchableOpacity>

            <Text style={s.sectionLabel}>BOOK CONTACTS ({contacts.length})</Text>
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="users" size={36} color={C.textSubtle} />
            <Text style={s.emptyText}>No contacts yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.contactCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
              <Text style={[s.avatarText, { color: C.primary }]}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={s.contactBody}>
              <Text style={s.contactName}>{item.name}</Text>
              {item.phone ? <Text style={s.contactPhone}>{item.phone}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={() => removeContact(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Add Contact Modal */}
      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={s.modalTitle}>Add Contact</Text>
            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Full name *"
              placeholderTextColor={C.textSubtle}
              autoFocus
            />
            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, marginBottom: 20 }]}
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={C.textSubtle}
              keyboardType="phone-pad"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: C.border }]} onPress={() => setAddVisible(false)} activeOpacity={0.8}>
                <Text style={[s.modalBtnText, { color: C.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: C.primary, borderColor: C.primary }]} onPress={addContact} activeOpacity={0.85}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.background },
  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addHeaderBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  content: { padding: 16, paddingBottom: 40 },

  toggleCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 12, marginBottom: 12,
  },
  toggleLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 15, fontFamily: Font.semiBold, color: C.text },
  toggleSub:   { fontSize: 12, fontFamily: Font.regular, color: C.textMuted },

  importRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 12, marginBottom: 20,
  },
  importLabel: { fontSize: 15, fontFamily: Font.semiBold, color: C.text },
  importSub:   { fontSize: 12, fontFamily: Font.regular, color: C.textMuted },

  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, color: C.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 2,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: 16, fontFamily: Font.bold },
  contactBody:  { flex: 1 },
  contactName:  { fontSize: 15, fontFamily: Font.semiBold, color: C.text },
  contactPhone: { fontSize: 12, fontFamily: Font.regular, color: C.textMuted },

  empty: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: Font.regular, color: C.textMuted },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', borderRadius: 20, borderWidth: 1,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 12,
  },
  modalTitle:   { fontSize: 17, fontFamily: Font.bold, color: C.text, marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: Font.regular, marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  modalBtnText: { fontSize: 15, fontFamily: Font.semiBold },
});
