import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, StatusBar,
  ScrollView, Modal, Alert, ActivityIndicator, Animated,
  Keyboard, Platform, TextInput,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import SearchBar from '../components/ui/SearchBar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import {
  usePaymentModes, useCreatePaymentMode, useUpdatePaymentMode,
  useDeletePaymentMode, useReorderPaymentModes,
} from '../hooks/usePaymentModes';
import PaymentModeMenuSheet from '../components/books/PaymentModeMenuSheet';
import DeleteContactSheet from '../components/ui/DeleteContactSheet';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ C, Font }) {
  return (
    <View style={es.wrap}>
      <View style={[es.iconBox, { backgroundColor: C.primaryLight }]}>
        <Feather name="credit-card" size={36} color={C.primary} />
      </View>
      <Text style={[es.title, { color: C.text, fontFamily: Font.bold }]}>
        No payment modes yet
      </Text>
      <Text style={[es.sub, { color: C.textMuted, fontFamily: Font.regular }]}>
        Tap the + button below{'\n'}to add your first payment mode
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

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PaymentModeSettingsScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(), []);

  const [search,     setSearch]     = useState('');
  const [addVisible, setAddVisible] = useState(false);
  const [newName,    setNewName]    = useState('');

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

  const [menuModeId,    setMenuModeId]    = useState(null);
  const [deletingMode,  setDeletingMode]  = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);


  const { data: ownBooks = [] }    = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = ownBooks.find(b => b.id === bookId);
  const isOwner  = !!currentBook;
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights   = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit   = rights !== 'view';
  const canDelete = rights === 'view_create_edit_delete';

  const { data: modes = [], isLoading } = usePaymentModes(bookId);
  const createMode  = useCreatePaymentMode(bookId);
  const deleteMode  = useDeletePaymentMode(bookId);
  const updateMode  = useUpdatePaymentMode(bookId, menuModeId);
  const reorderMode = useReorderPaymentModes(bookId);

  const [listItems, setListItems] = useState(() => [...modes]);

  // Sync local list when modes update from server
  useEffect(() => {
    setListItems([...modes]);
  }, [modes]);

  const moveItem = useCallback((idx, direction) => {
    setListItems(prev => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      reorderMode.mutate(next.map(m => m.id));
      return next;
    });
  }, [reorderMode]);

  const menuMode = useMemo(
    () => menuModeId ? (modes.find(m => m.id === menuModeId) ?? null) : null,
    [menuModeId, modes],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return listItems;
    const q = search.toLowerCase();
    return listItems.filter(m => m.name.toLowerCase().includes(q));
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

  const openDetail = (mode) => {
    router.push({
      pathname: `${basePath}/[id]/payment-mode-detail`,
      params: { id: bookId, name: bookName, modeId: mode.id, modeName: mode.name },
    });
  };

  const openBalance = (mode) => {
    router.push({
      pathname: `${basePath}/[id]/payment-mode-balance`,
      params: { id: bookId, name: bookName, modeId: mode.id, modeName: mode.name },
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a payment mode name.'); return; }
    createMode.mutate({ name }, {
      onSuccess: () => { setAddVisible(false); setNewName(''); },
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        if (detail.includes('already exists')) {
          Alert.alert('Duplicate', 'A payment mode with that name already exists.');
        } else {
          Alert.alert('Error', 'Failed to create payment mode.');
        }
      },
    });
  };

  const handleSaveEdit = (payload) => {
    updateMode.mutate(payload, {
      onSuccess: () => setMenuModeId(null),
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        Alert.alert('Error', detail.includes('already exists') ? 'That name already exists.' : 'Failed to save changes.');
      },
    });
  };

  const handleDeletePress = () => {
    const mode = menuMode;
    if (modes.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one payment mode.');
      return;
    }
    setMenuModeId(null);
    setDeletingMode(mode);
    setShowDeleteSheet(true);
  };

  const confirmDelete = () => {
    if (!deletingMode) return;
    deleteMode.mutate(deletingMode.id, {
      onSuccess: () => { setShowDeleteSheet(false); setDeletingMode(null); },
      onError: () => Alert.alert('Error', 'Failed to delete payment mode.'),
    });
  };

  // ── Render card ───────────────────────────────────────────────────────────

  const renderMode = (item, idx) => {
    const balance    = item.net_balance ?? 0;
    const isBankMode = ['cash', 'check', 'cheque'].includes(item.name?.toLowerCase().trim());
    const isFirst    = idx === 0;
    const isLast     = idx === listItems.length - 1;

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
            {isBankMode
              ? <MaterialCommunityIcons name="bank" size={20} color={C.primary} />
              : <Feather name="credit-card" size={20} color={C.primary} />
            }
          </View>

          {/* Name — tappable to open detail */}
          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openDetail(item)}
            onLongPress={canEdit ? () => setMenuModeId(item.id) : undefined}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <Text style={[s.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>

          {/* Balance pill */}
          <TouchableOpacity
            style={[s.balancePill, { backgroundColor: balance >= 0 ? C.cashInLight : C.dangerLight }]}
            onPress={() => openBalance(item)}
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
          <Text style={[s.headerTitle, { fontFamily: Font.bold }]}>Payment Modes</Text>
          {bookName ? <Text style={[s.headerSub, { fontFamily: Font.regular }]}>{bookName}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { borderBottomColor: C.border }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search payment modes…"
          onClear={() => setSearch('')}
        />
      </View>

      {/* List / empty states */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
      ) : isEmpty ? (
        <EmptyState C={C} Font={Font} />
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
          {filtered.map((item, idx) => renderMode(item, idx))}
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

      {/* FAB — hidden for view-only collaborators */}
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

      {/* Payment Mode Menu Sheet — long-press */}
      <PaymentModeMenuSheet
        visible={!!menuModeId}
        mode={menuMode}
        onClose={() => setMenuModeId(null)}
        onViewEntries={() => {
          setMenuModeId(null);
          if (menuMode) openBalance(menuMode);
        }}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDeletePress}
        saving={updateMode.isPending}
        canEdit={canEdit}
        canDelete={canDelete}
        C={C}
        Font={Font}
      />

      {/* Delete Sheet */}
      <DeleteContactSheet
        visible={showDeleteSheet}
        onDismiss={() => { setShowDeleteSheet(false); setDeletingMode(null); }}
        onConfirm={confirmDelete}
        contactName={deletingMode?.name}
        contactType="mode"
        isLoading={deleteMode.isPending}
        C={C}
        Font={Font}
      />

      {/* Add Modal */}
      <Modal visible={addVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => { setAddVisible(false); setNewName(''); }}>
        <View style={s.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setAddVisible(false); setNewName(''); }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <Animated.View style={{ marginBottom: kbOffset }}>
          <View style={[s.modalSheet, { backgroundColor: C.card }]}>
            <View style={[s.modalHandle, { backgroundColor: C.border }]} />
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: C.text, fontFamily: Font.bold }]}>Add Payment Mode</Text>
              <TouchableOpacity onPress={() => { setAddVisible(false); setNewName(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: C.border }]}
                onPress={() => { setAddVisible(false); setNewName(''); }}
              >
                <Text style={[s.modalBtnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={handleCreate}
                disabled={createMode.isPending}
              >
                {createMode.isPending
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

  searchWrap: { paddingVertical: 10, borderBottomWidth: 1 },
  listContent: { paddingTop: 12, paddingBottom: 120 },

  cardWrap:    { marginHorizontal: 16, marginBottom: 10 },
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 0, paddingRight: 14, borderWidth: 1.5, overflow: 'hidden' },
  arrowCol:    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 36, alignSelf: 'stretch', borderRightWidth: 1, marginRight: 8 },
  arrowBtn:    { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  arrowDivider:{ width: '100%', height: 1 },
  avatar:       { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardBody:     { flex: 1 },
  cardName:     { fontSize: 14, lineHeight: 20 },
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
