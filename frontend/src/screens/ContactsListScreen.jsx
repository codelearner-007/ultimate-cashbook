import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, StatusBar,
  ScrollView, Modal, Alert, ActivityIndicator, Animated,
  Keyboard, Platform, TextInput, Switch,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import SearchBar from '../components/ui/SearchBar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import {
  useContacts, useCreateContact, useUpdateContact, useDeleteContact,
  useReorderContacts,
} from '../hooks/useContacts';
import ContactMenuSheet from '../components/books/ContactMenuSheet';
import DeleteContactSheet from '../components/ui/DeleteContactSheet';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUpdateBookFieldSettings } from '../lib/dataSource';

const TYPE_CONFIG = {
  customer: { label: 'Customers', icon: 'user-check', emptyIcon: 'user-plus' },
  supplier: { label: 'Suppliers', icon: 'truck',       emptyIcon: 'truck'     },
};

function EmptyState({ cfg, C, Font }) {
  return (
    <View style={es.wrap}>
      <View style={[es.iconBox, { backgroundColor: C.primaryLight }]}>
        <Feather name={cfg.emptyIcon} size={36} color={C.primary} />
      </View>
      <Text style={[es.title, { color: C.text, fontFamily: Font.bold }]}>
        No {cfg.label} yet
      </Text>
      <Text style={[es.sub, { color: C.textMuted, fontFamily: Font.regular }]}>
        Tap the + button below{'\n'}to add your first {cfg.label.slice(0, -1).toLowerCase()}
      </Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  iconBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title:   { fontSize: 16, lineHeight: 24, marginBottom: 8 },
  sub:     { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});

export default function ContactsListScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName, type } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(), []);

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.customer;

  const qc = useQueryClient();
  const { data: books = [] }       = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook  = books.find(b => b.id === bookId);
  const isOwner      = !!currentBook;
  const sharedBook   = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights       = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit      = rights !== 'view';
  const canDelete    = rights === 'view_create_edit_delete';

  const bookData  = currentBook ?? sharedBook;
  const showField = type === 'supplier'
    ? (bookData?.show_supplier ?? false)
    : (bookData?.show_customer ?? false);

  const toggleField = useMutation({
    mutationFn: (newVal) => apiUpdateBookFieldSettings(bookId, {
      showCustomer:   type === 'customer' ? newVal : (bookData?.show_customer ?? false),
      showSupplier:   type === 'supplier' ? newVal : (bookData?.show_supplier ?? false),
      showCategory:   bookData?.show_category   ?? false,
      showAttachment: bookData?.show_attachment ?? false,
    }),
    onMutate: async (newVal) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      await qc.cancelQueries({ queryKey: cacheKey });
      const snapshot = qc.getQueryData(cacheKey);
      qc.setQueryData(cacheKey, (prev = []) =>
        prev.map(b => b.id === bookId ? {
          ...b,
          show_customer: type === 'customer' ? newVal : b.show_customer,
          show_supplier: type === 'supplier' ? newVal : b.show_supplier,
        } : b),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      if (ctx?.snapshot !== undefined) qc.setQueryData(cacheKey, ctx.snapshot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: isOwner ? ['books'] : ['shared-books'] }),
  });

  const [search,     setSearch]     = useState('');
  const [addVisible, setAddVisible] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newPhone,   setNewPhone]   = useState('');

  const kbOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up   = Keyboard.addListener(showEv, (e) =>
      Animated.timing(kbOffset, { toValue: e.endCoordinates.height, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
    );
    const down = Keyboard.addListener(hideEv, () =>
      Animated.timing(kbOffset, { toValue: 0, duration: 150, useNativeDriver: false }).start()
    );
    return () => { up.remove(); down.remove(); };
  }, [kbOffset]);


  const [menuContactId,   setMenuContactId]   = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const { data: contacts = [], isLoading } = useContacts(bookId, type);
  const createContact  = useCreateContact(bookId, type);
  const deleteContact  = useDeleteContact(bookId, type);
  const updateContact  = useUpdateContact(bookId, menuContactId, type);
  const reorderContacts = useReorderContacts(bookId, type);

  const menuContact = useMemo(
    () => menuContactId ? (contacts.find(c => c.id === menuContactId) ?? null) : null,
    [menuContactId, contacts],
  );

  const [listItems, setListItems] = useState(() => [...contacts]);

  // Sync local list when contacts update from server
  useEffect(() => {
    setListItems([...contacts]);
  }, [contacts]);

  const moveItem = useCallback((idx, direction) => {
    setListItems(prev => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      reorderContacts.mutate(next.map(c => c.id));
      return next;
    });
  }, [reorderContacts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return listItems;
    const q = search.toLowerCase();
    return listItems.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q),
    );
  }, [listItems, search]);

  const isFiltering = search.trim().length > 0;
  const isEmpty = !isLoading && listItems.length === 0;

  // ── FAB animations ────────────────────────────────────────────────────────
  const glowScale   = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const arrow1      = useRef(new Animated.Value(0)).current;
  const arrow2      = useRef(new Animated.Value(0)).current;
  const arrow3      = useRef(new Animated.Value(0)).current;
  const arrowAnims  = useMemo(() => [arrow1, arrow2, arrow3], []);

  useEffect(() => {
    if (!isEmpty) {
      glowScale.setValue(1); glowOpacity.setValue(0);
      arrowAnims.forEach(a => a.setValue(0));
      return;
    }
    const glow = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale,   { toValue: 2,    duration: 950, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0,    duration: 950, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale,   { toValue: 1,    duration: 0,   useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.55, duration: 0,   useNativeDriver: true }),
        ]),
      ]),
    );
    const cascade = Animated.loop(
      Animated.sequence([
        Animated.stagger(200, arrowAnims.map(a =>
          Animated.sequence([
            Animated.timing(a, { toValue: 1,    duration: 300, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.12, duration: 300, useNativeDriver: true }),
          ]),
        )),
        Animated.delay(400),
      ]),
    );
    glow.start(); cascade.start();
    return () => { glow.stop(); cascade.stop(); };
  }, [isEmpty]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openDetail = (contact) => {
    router.push({
      pathname: `${basePath}/[id]/contact-detail`,
      params: { id: bookId, name: bookName, contactId: contact.id, contactType: type, contactName: contact.name },
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a name.'); return; }
    createContact.mutate(
      { type, name, phone: newPhone.trim() || undefined },
      {
        onSuccess: () => { setAddVisible(false); setNewName(''); setNewPhone(''); },
        onError:   () => Alert.alert('Error', 'Failed to create contact.'),
      },
    );
  };

  const handleSaveEdit = (payload) => {
    updateContact.mutate(payload, {
      onSuccess: () => setMenuContactId(null),
      onError:   () => Alert.alert('Error', 'Failed to save changes.'),
    });
  };

  const handleDeletePress = () => {
    const contact = menuContact;
    setMenuContactId(null);
    setDeletingContact(contact);
    setShowDeleteSheet(true);
  };

  const confirmDelete = () => {
    if (!deletingContact) return;
    deleteContact.mutate(deletingContact.id, {
      onSuccess: () => { setShowDeleteSheet(false); setDeletingContact(null); },
      onError:   () => Alert.alert('Error', 'Failed to delete contact.'),
    });
  };

  // ── Render card ───────────────────────────────────────────────────────────

  const renderContact = (item, idx) => {
    const balance = item.balance ?? 0;
    const isFirst = idx === 0;
    const isLast  = idx === listItems.length - 1;

    return (
      <View key={item.id} style={s.cardWrap}>
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {/* Up/Down arrows — left strip inside card */}
          {canEdit && !isFiltering && (
            <View style={[s.arrowCol, { borderRightColor: C.primaryMid }]}>
              <TouchableOpacity
                onPress={() => moveItem(idx, -1)}
                disabled={isFirst}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={[s.arrowBtn, { opacity: isFirst ? 0.25 : 1 }]}
              >
                <Feather name="chevron-up" size={15} color={C.primary} />
              </TouchableOpacity>
              <View style={[s.arrowDivider, { backgroundColor: C.primaryMid }]} />
              <TouchableOpacity
                onPress={() => moveItem(idx, 1)}
                disabled={isLast}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={[s.arrowBtn, { opacity: isLast ? 0.25 : 1 }]}
              >
                <Feather name="chevron-down" size={15} color={C.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Icon */}
          <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name={cfg.icon} size={20} color={C.primary} />
          </View>

          {/* Body — tap to open detail, long-press for menu */}
          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openDetail(item)}
            onLongPress={canEdit ? () => setMenuContactId(item.id) : undefined}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <Text style={[s.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.phone
              ? <Text style={[s.cardSub, { color: C.textMuted, fontFamily: Font.regular }]}>{item.phone}</Text>
              : null}
          </TouchableOpacity>

          {/* Balance pill */}
          <TouchableOpacity
            style={[s.balancePill, { backgroundColor: balance >= 0 ? C.cashInLight : C.dangerLight }]}
            onPress={() => router.push({
              pathname: `${basePath}/[id]/contact-balance`,
              params: { id: bookId, name: bookName, contactId: item.id, contactName: item.name, contactType: type },
            })}
            activeOpacity={0.8}
          >
            <Text style={[s.balanceText, { color: balance >= 0 ? C.cashIn : C.danger, fontFamily: Font.bold }]}>
              {Math.abs(balance).toLocaleString()}
            </Text>
            <Feather name="chevron-right" size={11} color={balance >= 0 ? C.cashIn : C.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: C.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { fontFamily: Font.bold }]}>{cfg.label}</Text>
          {bookName ? <Text style={[s.headerSub, { fontFamily: Font.regular }]}>{bookName}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Field visibility toggle */}
      <View style={[s.toggleRow, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <View style={[s.toggleIconBox, { backgroundColor: C.primaryLight }]}>
          <Feather name="edit-3" size={15} color={C.primary} />
        </View>
        <View style={s.toggleBody}>
          <Text style={[s.toggleLabel, { color: C.text, fontFamily: Font.semiBold }]}>
            Show {cfg.label.slice(0, -1)} Field
          </Text>
          <Text style={[s.toggleSub, { color: C.textMuted, fontFamily: Font.regular }]}>
            {cfg.label.slice(0, -1)} field in Cash In / Cash Out
          </Text>
        </View>
        <Switch
          value={showField}
          onValueChange={isOwner ? (v) => toggleField.mutate(v) : undefined}
          disabled={!isOwner}
          trackColor={{ false: C.border, true: C.primary }}
          thumbColor="#fff"
        />
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { borderBottomColor: C.border }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${cfg.label.toLowerCase()}…`}
          onClear={() => setSearch('')}
        />
      </View>

      {/* List / empty states */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
      ) : isEmpty ? (
        <EmptyState cfg={cfg} C={C} Font={Font} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Feather name="search" size={40} color={C.border} />
          <Text style={[s.emptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No results</Text>
          <Text style={[s.emptySub, { color: C.textMuted, fontFamily: Font.regular }]}>Try a different search.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
        >
          {filtered.map((item, idx) => renderContact(item, idx))}
        </ScrollView>
      )}

      {/* Cascading arrows → FAB (only when empty + canEdit) */}
      {isEmpty && canEdit && (
        <View style={s.fabArrow}>
          {arrowAnims.map((anim, i) => (
            <Animated.View key={i} style={{ opacity: anim }}>
              <Feather name="chevron-right" size={28} color={C.primary} />
            </Animated.View>
          ))}
        </View>
      )}

      {/* FAB */}
      {canEdit && (
        <View style={s.fabWrap}>
          {isEmpty && (
            <Animated.View
              style={[s.fabGlow, { backgroundColor: C.primary, opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
            />
          )}
          <TouchableOpacity
            style={[s.fab, { backgroundColor: C.primary }]}
            onPress={() => setAddVisible(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Contact Menu Sheet — long-press */}
      <ContactMenuSheet
        visible={!!menuContactId}
        contact={menuContact}
        contactType={type}
        onClose={() => setMenuContactId(null)}
        onViewEntries={() => {
          setMenuContactId(null);
          router.push({
            pathname: `${basePath}/[id]/contact-balance`,
            params: { id: bookId, name: bookName, contactId: menuContact?.id, contactName: menuContact?.name, contactType: type },
          });
        }}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDeletePress}
        saving={updateContact.isPending}
        canEdit={canEdit}
        canDelete={canDelete}
        C={C}
        Font={Font}
      />

      {/* Delete Contact Sheet */}
      <DeleteContactSheet
        visible={showDeleteSheet}
        onDismiss={() => { setShowDeleteSheet(false); setDeletingContact(null); }}
        onConfirm={confirmDelete}
        contactName={deletingContact?.name}
        contactType={type}
        isLoading={deleteContact.isPending}
        C={C}
        Font={Font}
      />

      {/* Add Modal */}
      <Modal visible={addVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => { setAddVisible(false); setNewName(''); setNewPhone(''); }}>
        <View style={s.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setAddVisible(false); setNewName(''); setNewPhone(''); }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <Animated.View style={{ marginBottom: kbOffset }}>
          <View style={[s.modalSheet, { backgroundColor: C.card }]}>
            <View style={[s.modalHandle, { backgroundColor: C.border }]} />
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: C.text, fontFamily: Font.bold }]}>
                Add {cfg.label.slice(0, -1)}
              </Text>
              <TouchableOpacity onPress={() => { setAddVisible(false); setNewName(''); setNewPhone(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, fontFamily: Font.regular }]}
              placeholder="Name *"
              placeholderTextColor={C.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="next"
            />
            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, fontFamily: Font.regular }]}
              placeholder="Phone (optional)"
              placeholderTextColor={C.textMuted}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: C.border }]}
                onPress={() => { setAddVisible(false); setNewName(''); setNewPhone(''); }}
              >
                <Text style={[s.modalBtnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={handleCreate}
                disabled={createContact.isPending}
              >
                {createContact.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[s.modalBtnText, { color: '#fff', fontFamily: Font.semiBold }]}>Add</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
          </Animated.View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, color: '#fff', lineHeight: 24 },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },

  toggleRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1 },
  toggleIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleBody:    { flex: 1 },
  toggleLabel:   { fontSize: 14, lineHeight: 20 },
  toggleSub:     { fontSize: 11, lineHeight: 16, marginTop: 1 },

  searchWrap:  { paddingVertical: 10, borderBottomWidth: 1 },
  listContent: { paddingTop: 12, paddingBottom: 120 },

  cardWrap:    { marginHorizontal: 16, marginBottom: 10 },
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 0, paddingRight: 14, borderWidth: 1.5, overflow: 'hidden' },
  arrowCol:    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 36, alignSelf: 'stretch', borderRightWidth: 1, marginRight: 8 },
  arrowBtn:    { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  arrowDivider:{ width: '100%', height: 1 },
  avatar:       { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardBody:     { flex: 1 },
  cardName:     { fontSize: 14, lineHeight: 20 },
  cardSub:      { fontSize: 12, lineHeight: 18, marginTop: 1 },
  balancePill:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  balanceText:  { fontSize: 13, lineHeight: 18 },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyTitle: { fontSize: 17, lineHeight: 26 },
  emptySub:   { fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 240 },

  fabWrap: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10,
  },
  fabGlow: { position: 'absolute', width: 56, height: 56, borderRadius: 28 },
  fab:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fabArrow:{ position: 'absolute', bottom: 38, right: 88, flexDirection: 'row', alignItems: 'center', gap: -6 },

  modalRoot:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12 },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontSize: 17, lineHeight: 26 },
  modalInput:   { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 15, lineHeight: 22 },
});
