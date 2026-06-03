import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import DeleteContactSheet from '../components/ui/DeleteContactSheet';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useContact, useUpdateContact, useDeleteContact } from '../hooks/useContacts';
import { useRealtimeEntries } from '../hooks/useRealtimeSync';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import AppInput from '../components/ui/Input';
import SuccessDialog from '../components/ui/SuccessDialog';

const TYPE_CONFIG = {
  customer: { label: 'Customer', icon: 'user-check' },
  supplier: { label: 'Supplier', icon: 'truck' },
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

export default function ContactDetailScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName, contactId, contactType, contactName } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);

  const cfg = TYPE_CONFIG[contactType] || TYPE_CONFIG.customer;

  useRealtimeEntries(bookId);
  const { data: ownBooks = [] }    = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = ownBooks.find(b => b.id === bookId);
  const isOwner    = !!currentBook;
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights     = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit    = rights !== 'view';
  const canDelete  = rights === 'view_create_edit_delete';

  const { data: contact, isLoading } = useContact(bookId, contactId, contactType);
  const updateContact = useUpdateContact(bookId, contactId, contactType);
  const deleteContact = useDeleteContact(bookId, contactType);

  const [name,    setName]    = useState(contactName || '');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [address, setAddress] = useState('');
  const [dirty,            setDirty]            = useState(false);
  const [showSuccess,      setShowSuccess]      = useState(false);
  const [showDeleteSheet,  setShowDeleteSheet]  = useState(false);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setPhone(contact.phone || '');
      setEmail(contact.email || '');
      setAddress(contact.address || '');
      setDirty(false);
    }
  }, [contact?.id]);

  const markDirty = (setter) => (val) => { setter(val); setDirty(true); };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a name.'); return; }
    updateContact.mutate(
      { name: trimmed, phone: phone.trim() || undefined, email: email.trim() || undefined, address: address.trim() || undefined },
      {
        onSuccess: () => { setDirty(false); setShowSuccess(true); },
        onError: () => Alert.alert('Error', 'Failed to save changes.'),
      }
    );
  };

  const handleDelete = () => setShowDeleteSheet(true);

  const confirmDelete = () => {
    deleteContact.mutate(contactId, {
      onSuccess: () => { setShowDeleteSheet(false); router.back(); },
      onError:   () => { setShowDeleteSheet(false); Alert.alert('Error', 'Failed to delete.'); },
    });
  };

  const openBalance = () => {
    router.push({
      pathname: `${basePath}/[id]/contact-balance`,
      params: { id: bookId, name: bookName, contactId, contactName: name, contactType },
    });
  };

  const netBalance  = contact?.net_balance ?? contact?.balance ?? 0;
  const totalIn     = contact?.total_in  ?? 0;
  const totalOut    = contact?.total_out ?? 0;
  const balanceColor = netBalance >= 0 ? C.cashIn : C.danger;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{cfg.label} Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

        {isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : (
          <>
            {/* Avatar card */}
            <View style={s.avatarShadow}>
              <View style={[s.avatarCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[s.avatarCircle, { backgroundColor: C.primaryLight }]}>
                  <Feather name={cfg.icon} size={20} color={C.primary} />
                </View>
                <Text style={[s.avatarName, { color: C.text }]} numberOfLines={1}>{name || '—'}</Text>
                <View style={[s.typeBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name={cfg.icon} size={11} color={C.primary} />
                  <Text style={[s.typeBadgeText, { color: C.primary, fontFamily: Font.semiBold }]}>{cfg.label}</Text>
                </View>
              </View>
            </View>

            {/* Balance section */}
            <View style={s.sectionWrap}>
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>BALANCE</Text>
              <TouchableOpacity
                style={[s.balanceCard, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={openBalance}
                activeOpacity={0.8}
              >
                <View style={s.balanceStat}>
                  <Text style={[s.balanceStatLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Cash In</Text>
                  <Text style={[s.balanceStatValue, { color: C.cashIn, fontFamily: Font.bold }]}>{totalIn.toLocaleString()}</Text>
                </View>
                <View style={[s.balanceVDivider, { backgroundColor: C.border }]} />
                <View style={s.balanceStat}>
                  <Text style={[s.balanceStatLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Net Balance</Text>
                  <Text style={[s.balanceNetAmount, { color: balanceColor, fontFamily: Font.bold }]}>
                    {Math.abs(netBalance).toLocaleString()}
                  </Text>
                </View>
                <View style={[s.balanceVDivider, { backgroundColor: C.border }]} />
                <View style={s.balanceStat}>
                  <Text style={[s.balanceStatLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Cash Out</Text>
                  <Text style={[s.balanceStatValue, { color: C.danger, fontFamily: Font.bold }]}>{totalOut.toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Contact info fields */}
            <View style={s.sectionWrap}>
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>CONTACT INFO</Text>
              <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <AppInput
                  label="Name"
                  value={name}
                  onChangeText={canEdit ? markDirty(setName) : undefined}
                  placeholder="Full name"
                  editable={canEdit}
                />
                <AppInput
                  label="Phone"
                  value={phone}
                  onChangeText={canEdit ? markDirty(setPhone) : undefined}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  editable={canEdit}
                />
                <AppInput
                  label="Email"
                  value={email}
                  onChangeText={canEdit ? markDirty(setEmail) : undefined}
                  placeholder="Email address"
                  keyboardType="email-address"
                  editable={canEdit}
                />
                <AppInput
                  label="Address"
                  value={address}
                  onChangeText={canEdit ? markDirty(setAddress) : undefined}
                  placeholder="Street, City, Country"
                  editable={canEdit}
                  isLast
                />
              </View>
            </View>

            {/* Save button — hidden for view-only collaborators */}
            {canEdit && (
              <View style={s.btnWrap}>
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: C.primary, opacity: dirty && !updateContact.isPending ? 1 : 0.4 }]}
                  onPress={handleSave}
                  disabled={!dirty || updateContact.isPending}
                  activeOpacity={0.85}
                >
                  <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>
                    {updateContact.isPending ? 'Saving…' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* View entries */}
            <View style={s.sectionWrap}>
              <TouchableOpacity
                style={[s.viewEntriesBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={openBalance}
                activeOpacity={0.8}
              >
                <Feather name="list" size={16} color={C.primary} />
                <Text style={[s.viewEntriesText, { color: C.primary, fontFamily: Font.semiBold }]}>View All Entries</Text>
                <Feather name="chevron-right" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>

            {/* Danger zone — hidden for collaborators without delete permission */}
            {canDelete && (
              <View style={s.sectionWrap}>
                <Text style={[s.sectionLabel, { color: C.textMuted }]}>DANGER ZONE</Text>
                <View style={[s.card, { backgroundColor: C.card, borderColor: C.border, overflow: 'hidden' }]}>
                  <TouchableOpacity
                    style={s.deleteRow}
                    onPress={handleDelete}
                    activeOpacity={0.75}
                  >
                    <View style={s.deleteIconWrap}>
                      <Feather name="trash-2" size={16} color={C.danger} />
                    </View>
                    <View style={s.deleteBody}>
                      <Text style={[s.deleteTitle, { color: C.danger, fontFamily: Font.semiBold }]}>
                        Delete {cfg.label}
                      </Text>
                      <Text style={[s.deleteSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                        Linked entries will not be deleted
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={C.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

      </ScrollView>
      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title="Changes Saved"
        subtitle={`${cfg.label} details have been updated`}
      />

      <DeleteContactSheet
        visible={showDeleteSheet}
        onDismiss={() => setShowDeleteSheet(false)}
        onConfirm={confirmDelete}
        contactName={name}
        contactType={contactType}
        isLoading={deleteContact.isPending}
        C={C}
        Font={Font}
      />
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  loadingBox: { paddingTop: 60, alignItems: 'center' },

  // Header
  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  // Avatar card
  avatarShadow: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  avatarCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarName: { flex: 1, fontSize: 15, fontFamily: Font.bold, lineHeight: 22 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  typeBadgeText: { fontSize: 12, lineHeight: 17 },

  // Sections
  sectionWrap:  { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },

  // Balance card
  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 16,
  },
  balanceStat:      { flex: 1, alignItems: 'center', gap: 4 },
  balanceVDivider:  { width: 1, height: 36 },
  balanceStatLabel: { fontSize: 11, lineHeight: 16 },
  balanceStatValue: { fontSize: 15, lineHeight: 22 },
  balanceNetAmount: { fontSize: 18, lineHeight: 26 },

  // Input card
  card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },

  // Save button
  btnWrap: { marginHorizontal: 16, marginTop: 16 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },

  // View entries button
  viewEntriesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 16,
    paddingVertical: 15, paddingHorizontal: 16,
  },
  viewEntriesText: { fontSize: 15, lineHeight: 22, flex: 1 },

  // Delete row
  deleteRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  deleteIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.dangerLight,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBody:  { flex: 1 },
  deleteTitle: { fontSize: 15, lineHeight: 22 },
  deleteSub:   { fontSize: 12, lineHeight: 18, marginTop: 1 },
});
