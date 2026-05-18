import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert, Modal,
  Keyboard, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useCustomers, useSuppliers, useCreateCustomer, useCreateSupplier } from '../../hooks/useContacts';
import SearchBar from '../ui/SearchBar';
import AppInput from '../ui/Input';

// expo-contacts is optional — install with: npx expo install expo-contacts
let Contacts = null;
try { Contacts = require('expo-contacts'); } catch (_) {}

const TYPE_CONFIG = {
  customer: { label: 'Customer', labelPlural: 'Customers', icon: 'user',  bg: '#DCFCE7', color: '#16A34A' },
  supplier: { label: 'Supplier', labelPlural: 'Suppliers', icon: 'truck', bg: '#FEF3C7', color: '#D97706' },
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

export default function ContactPickerModal({
  visible,
  bookId,
  selectedContactId,
  selectedContactType,   // 'customer' | 'supplier' | null — drives initial tab
  allowedTypes = ['customer', 'supplier'],  // which tabs/types are enabled
  onSelect,
  onDeselect,
  onClose,
}) {
  const { C, Font } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);

  const [view,         setView]         = useState('list');
  const [activeTab,    setActiveTab]    = useState(allowedTypes[0] || 'customer');
  const [search,       setSearch]       = useState('');
  const [phoneSearch,  setPhoneSearch]  = useState('');
  const [newName,      setNewName]      = useState('');
  const [newPhone,     setNewPhone]     = useState('');
  const [newType,      setNewType]      = useState('customer');
  const [phoneList,    setPhoneList]    = useState([]);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [nameError,    setNameError]    = useState('');

  const { data: customers = [], isLoading: loadingC } = useCustomers(bookId);
  const { data: suppliers  = [], isLoading: loadingS } = useSuppliers(bookId);
  const createCustomer = useCreateCustomer(bookId);
  const createSupplier = useCreateSupplier(bookId);
  const isLoading = loadingC || loadingS;

  // ── filtered list for active tab ─────────────────────────────────────────────
  const filteredList = useMemo(() => {
    const source = activeTab === 'customer' ? customers : suppliers;
    const q = search.toLowerCase().trim();
    if (!q) return source;
    return source.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    );
  }, [activeTab, customers, suppliers, search]);

  // ── phone contacts ───────────────────────────────────────────────────────────
  const filteredPhone = useMemo(() => {
    const q = phoneSearch.toLowerCase().trim();
    if (!q) return phoneList;
    return phoneList.filter(c =>
      (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    );
  }, [phoneList, phoneSearch]);

  const openPhoneView = useCallback(async () => {
    if (!Contacts) {
      Alert.alert('Package required', 'Run:\n  npx expo install expo-contacts\nin the frontend directory, then restart.');
      return;
    }
    setNewType(activeTab);   // carry active tab into the create form
    setView('phone');
    setLoadingPhone(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow contacts access in your device settings.');
        setView('list');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      const mapped = data
        .filter(c => c.name)
        .map(c => ({ name: c.name, phone: c.phoneNumbers?.[0]?.number || '' }));
      setPhoneList(mapped);
    } catch {
      Alert.alert('Error', 'Could not read contacts.');
      setView('list');
    } finally {
      setLoadingPhone(false);
    }
  }, [activeTab]);

  const pickPhoneContact = (c) => {
    setNewName(c.name);
    setNewPhone(c.phone);
    setView('create');
    setPhoneSearch('');
  };

  // ── create ───────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { setNameError('Name is required'); return; }
    const fn = newType === 'customer' ? createCustomer : createSupplier;
    fn.mutate(
      { name, phone: newPhone.trim() || undefined },
      {
        onSuccess: (contact) => {
          resetAll();
          onSelect({
            id: contact.id, name: contact.name, type: newType,
            customer_id: newType === 'customer' ? contact.id : null,
            supplier_id: newType === 'supplier' ? contact.id : null,
          });
        },
        onError: () => Alert.alert('Error', 'Failed to create contact.'),
      }
    );
  };

  const resetAll = () => {
    setView('list');
    setActiveTab(allowedTypes[0] || 'customer');
    setSearch('');
    setPhoneSearch('');
    setNewName('');
    setNewPhone('');
    setNewType('customer');
    setPhoneList([]);
    setNameError('');
  };

  const handleClose = () => { resetAll(); onClose(); };

  const headerTitle = { list: 'Select Contact', create: 'New Contact', phone: 'Phone Contacts' }[view];
  const handleBack  = view === 'list' ? null : () => setView('list');
  const isPending   = createCustomer.isPending || createSupplier.isPending;

  // ── open on the correct tab when a contact is already selected ──────────────
  useEffect(() => {
    if (!visible) return;
    if (selectedContactId && selectedContactType && allowedTypes.includes(selectedContactType)) {
      setActiveTab(selectedContactType);
    } else {
      setActiveTab(allowedTypes[0] || 'customer');
    }
  }, [visible]);

  // ── keyboard avoidance: float sheet above keyboard with marginBottom ──────────
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!visible) { setKbHeight(0); return; }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <Pressable style={[s.overlay, { backgroundColor: C.overlay }]} onPress={handleClose}>
        <Pressable
          style={[s.sheet, { backgroundColor: C.card, marginBottom: kbHeight }]}
          onPress={() => {}}
        >
          {/* ── Handle ── */}
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* ── Header ── */}
          <View style={s.header}>
            {handleBack ? (
              <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.headerSideBtn}>
                <Feather name="arrow-left" size={20} color={C.text} />
              </TouchableOpacity>
            ) : (
              <View style={s.headerSideBtn} />
            )}
            <Text style={[s.headerTitle, { color: C.text, fontFamily: Font.bold }]}>{headerTitle}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.headerSideBtn}>
              <Feather name="x" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── LIST VIEW ── */}
          {view === 'list' && (
            <>
              {/* Search */}
              <SearchBar
                value={search}
                onChangeText={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search contacts…"
                style={s.searchOverride}
              />

              {/* Tabs: Customers | Suppliers — hidden when only one type is allowed */}
              {allowedTypes.length > 1 && (
                <View style={[s.tabRow, { borderBottomColor: C.border }]}>
                  {allowedTypes.map((t) => {
                    const cfg = TYPE_CONFIG[t];
                    const active = activeTab === t;
                    const count = t === 'customer' ? customers.length : suppliers.length;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[s.tabBtn, { borderBottomColor: active ? cfg.color : 'transparent' }]}
                        onPress={() => setActiveTab(t)}
                        activeOpacity={0.7}
                      >
                        <Feather name={cfg.icon} size={13} color={active ? cfg.color : C.textMuted} />
                        <Text style={[s.tabLabel, { color: active ? cfg.color : C.textMuted, fontFamily: active ? Font.bold : Font.regular }]}>
                          {cfg.labelPlural}
                        </Text>
                        <View style={[s.tabBadge, { backgroundColor: active ? cfg.bg : C.background }]}>
                          <Text style={[s.tabBadgeText, { color: active ? cfg.color : C.textMuted, fontFamily: Font.bold }]}>
                            {count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Remove selected contact */}
              {selectedContactId && (
                <TouchableOpacity
                  style={[s.removeBtn, { borderColor: C.danger, backgroundColor: C.dangerLight }]}
                  onPress={onDeselect}
                  activeOpacity={0.8}
                >
                  <Feather name="x-circle" size={14} color={C.danger} />
                  <Text style={[s.removeBtnText, { color: C.danger, fontFamily: Font.semiBold }]}>
                    Remove selected contact
                  </Text>
                </TouchableOpacity>
              )}

              {/* Contact list */}
              {isLoading ? (
                <ActivityIndicator style={s.loader} color={C.primary} />
              ) : filteredList.length === 0 ? (
                <View style={s.empty}>
                  <Feather name={TYPE_CONFIG[activeTab].icon} size={32} color={C.border} />
                  <Text style={[s.emptyText, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {search
                      ? `No ${TYPE_CONFIG[activeTab].labelPlural.toLowerCase()} match your search.`
                      : `No ${TYPE_CONFIG[activeTab].labelPlural.toLowerCase()} yet.`}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredList}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  style={s.list}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item, index }) => {
                    const isSelected = item.id === selectedContactId;
                    const cfg = TYPE_CONFIG[activeTab];
                    const isLast = index === filteredList.length - 1;
                    return (
                      <TouchableOpacity
                        style={[
                          s.contactRow,
                          { borderBottomColor: C.border },
                          isLast && { borderBottomWidth: 0 },
                          isSelected && { backgroundColor: C.primaryLight },
                        ]}
                        onPress={() => onSelect({
                          id: item.id, name: item.name, type: activeTab,
                          customer_id: activeTab === 'customer' ? item.id : null,
                          supplier_id: activeTab === 'supplier' ? item.id : null,
                        })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.avatar, { backgroundColor: cfg.bg }]}>
                          <Text style={[s.avatarText, { color: cfg.color, fontFamily: Font.bold }]}>
                            {initials(item.name)}
                          </Text>
                        </View>
                        <View style={s.contactBody}>
                          <Text style={[s.contactName, { color: C.text, fontFamily: Font.semiBold }]}>
                            {item.name}
                          </Text>
                          {item.phone
                            ? <Text style={[s.contactPhone, { color: C.textMuted, fontFamily: Font.regular }]}>{item.phone}</Text>
                            : null}
                        </View>
                        {isSelected && <Feather name="check-circle" size={18} color={C.primary} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              {/* Sticky action buttons */}
              <View style={[s.actionRow, { borderTopColor: C.border }]}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
                  onPress={() => { setNewType(activeTab); setView('create'); }}
                  activeOpacity={0.8}
                >
                  <Feather name="user-plus" size={14} color={C.primary} />
                  <Text style={[s.actionBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>New Contact</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={openPhoneView}
                  activeOpacity={0.8}
                >
                  <Feather name="smartphone" size={14} color={C.textMuted} />
                  <Text style={[s.actionBtnText, { color: C.text, fontFamily: Font.semiBold }]}>From Phone</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── CREATE VIEW ── */}
          {view === 'create' && (
            <View style={s.createWrap}>
              <Text style={[s.fieldLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>Type</Text>
              <View style={s.typeRow}>
                {allowedTypes.map((t) => {
                  const cfg = TYPE_CONFIG[t];
                  const active = newType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeChip, { borderColor: active ? cfg.color : C.border, backgroundColor: active ? cfg.bg : C.background }]}
                      onPress={() => setNewType(t)}
                      activeOpacity={0.8}
                    >
                      <Feather name={cfg.icon} size={15} color={active ? cfg.color : C.textMuted} />
                      <Text style={[s.typeChipText, { color: active ? cfg.color : C.text, fontFamily: Font.semiBold }]}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <AppInput
                label="Name *"
                value={newName}
                onChangeText={(t) => { setNewName(t); if (nameError) setNameError(''); }}
                placeholder="Full name"
                autoFocus={!newName}
                error={nameError}
                style={{ marginTop: 8 }}
              />
              <AppInput
                label="Phone"
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone number (optional)"
                keyboardType="phone-pad"
                isLast
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: C.primary }, isPending && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={isPending}
                activeOpacity={0.85}
              >
                {isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      <Feather name="user-plus" size={16} color="#fff" />
                      <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>Add Contact</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── PHONE CONTACTS VIEW ── */}
          {view === 'phone' && (
            <>
              <SearchBar
                value={phoneSearch}
                onChangeText={setPhoneSearch}
                onClear={() => setPhoneSearch('')}
                placeholder="Search phone contacts…"
                autoFocus
                style={s.searchOverride}
              />

              {loadingPhone ? (
                <View style={s.empty}>
                  <ActivityIndicator color={C.primary} size="large" />
                  <Text style={[s.emptyText, { color: C.textMuted, fontFamily: Font.regular }]}>Loading contacts…</Text>
                </View>
              ) : filteredPhone.length === 0 ? (
                <View style={s.empty}>
                  <Feather name="smartphone" size={36} color={C.border} />
                  <Text style={[s.emptyText, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {phoneSearch ? 'No contacts match.' : 'No contacts found on device.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredPhone}
                  keyExtractor={(item, i) => `${item.name}-${i}`}
                  showsVerticalScrollIndicator={false}
                  style={s.list}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[s.contactRow, { borderBottomColor: C.border }]}
                      onPress={() => pickPhoneContact(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
                        <Text style={[s.avatarText, { color: C.primary, fontFamily: Font.bold }]}>
                          {initials(item.name)}
                        </Text>
                      </View>
                      <View style={s.contactBody}>
                        <Text style={[s.contactName, { color: C.text, fontFamily: Font.semiBold }]}>{item.name}</Text>
                        {item.phone
                          ? <Text style={[s.contactPhone, { color: C.textMuted, fontFamily: Font.regular }]}>{item.phone}</Text>
                          : null}
                      </View>
                      <Feather name="plus-circle" size={20} color={C.primary} />
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    maxHeight: '78%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },

  // Header
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSideBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 15, lineHeight: 22 },

  // Override SearchBar default margins for use inside the modal
  searchOverride: { marginHorizontal: 0, marginBottom: 0 },

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 10, marginBottom: 6 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderBottomWidth: 2, marginBottom: -1 },
  tabLabel:      { fontSize: 13, lineHeight: 18 },
  tabBadge:      { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  tabBadgeText:  { fontSize: 11, lineHeight: 16 },

  // Remove button
  removeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 8, marginBottom: 4 },
  removeBtnText: { fontSize: 12, lineHeight: 18 },

  // List — flexShrink: 1 lets FlatList shrink when sheet hits maxHeight, enabling scroll
  list:   { flexShrink: 1 },
  loader: { marginVertical: 20 },

  // Contact row
  contactRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  avatar:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 13, lineHeight: 18 },
  contactBody: { flex: 1 },
  contactName: { fontSize: 14, lineHeight: 20 },
  contactPhone:{ fontSize: 11, lineHeight: 16, marginTop: 1 },

  // Empty
  empty:     { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 220 },

  // Sticky action row below list
  actionRow:     { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderRadius: 12, paddingVertical: 9 },
  actionBtnText: { fontSize: 13, lineHeight: 18 },

  // Create form
  createWrap:   {},
  fieldLabel:   { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  typeRow:      { flexDirection: 'row', gap: 8, marginBottom: 2 },
  typeChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  typeChipText: { fontSize: 13, lineHeight: 18 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  saveBtnText:  { color: '#fff', fontSize: 15, lineHeight: 22 },
});
