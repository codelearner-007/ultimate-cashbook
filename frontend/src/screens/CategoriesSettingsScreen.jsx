import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
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
  useCategories, useCreateCategory, useReorderCategories,
} from '../hooks/useCategories';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUpdateBookFieldSettings } from '../lib/dataSource';
import { DragHandleIcon } from '../components/books/DraggableList';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ C, Font }) {
  return (
    <View style={es.wrap}>
      <View style={[es.iconBox, { backgroundColor: C.primaryLight }]}>
        <Feather name="tag" size={36} color={C.primary} />
      </View>
      <Text style={[es.title, { color: C.text, fontFamily: Font.bold }]}>
        No categories yet
      </Text>
      <Text style={[es.sub, { color: C.textMuted, fontFamily: Font.regular }]}>
        Tap the + button below{'\n'}to add your first category
      </Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  iconBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 16, lineHeight: 24, marginBottom: 8 },
  sub: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CategoriesSettingsScreen() {
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


  const qc = useQueryClient();
  const { data: books = [] }       = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook  = books.find(b => b.id === bookId);
  const isOwner      = !!currentBook;
  const sharedBook   = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights       = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit      = rights !== 'view';

  const bookData     = currentBook ?? sharedBook;
  const showCategory = bookData?.show_category ?? false;

  const toggleCategory = useMutation({
    mutationFn: (newVal) => apiUpdateBookFieldSettings(bookId, {
      showCustomer:   bookData?.show_customer   ?? false,
      showSupplier:   bookData?.show_supplier   ?? false,
      showCategory:   newVal,
      showAttachment: bookData?.show_attachment ?? false,
    }),
    onMutate: async (newVal) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      await qc.cancelQueries({ queryKey: cacheKey });
      const snapshot = qc.getQueryData(cacheKey);
      qc.setQueryData(cacheKey, (prev = []) =>
        prev.map(b => b.id === bookId ? { ...b, show_category: newVal } : b),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      if (ctx?.snapshot !== undefined) qc.setQueryData(cacheKey, ctx.snapshot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: isOwner ? ['books'] : ['shared-books'] }),
  });

  const { data: categories = [], isLoading } = useCategories(bookId);
  const { mutate: createCategory, isPending: creating } = useCreateCategory(bookId);
  const reorderCategories = useReorderCategories(bookId);

  // ── Drag state ────────────────────────────────────────────────────────────
  const ITEM_H = 74; // card height 64 + marginBottom 10
  const clamp  = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const [listItems,  setListItems]  = useState(() => [...categories]);
  const [dragIdx,    setDragIdx]    = useState(-1);
  const [insertAt,   setInsertAt]   = useState(-1);

  const dragIdxRef    = useRef(-1);
  const insertAtRef   = useRef(-1);
  const dragStartYRef = useRef(0);
  const dragDy        = useRef(new Animated.Value(0)).current;

  // Sync local list when categories update from server (not while dragging)
  useEffect(() => {
    if (dragIdx < 0) setListItems([...categories]);
  }, [categories, dragIdx]);

  const startDrag = useCallback((idx, pageY) => {
    dragIdxRef.current    = idx;
    insertAtRef.current   = idx;
    dragStartYRef.current = pageY;
    dragDy.setValue(0);
    setDragIdx(idx);
    setInsertAt(idx);
  }, [dragDy]);

  const moveDrag = useCallback((pageY) => {
    const dy = pageY - dragStartYRef.current;
    dragDy.setValue(dy);
    const newInsert = clamp(
      Math.round((dragIdxRef.current * ITEM_H + dy) / ITEM_H),
      0,
      listItems.length - 1,
    );
    if (newInsert !== insertAtRef.current) {
      insertAtRef.current = newInsert;
      setInsertAt(newInsert);
    }
  }, [dragDy, listItems.length]);

  const endDrag = useCallback(() => {
    const from = dragIdxRef.current;
    const to   = insertAtRef.current;

    if (from >= 0 && from !== to) {
      setListItems(prev => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        reorderCategories.mutate(next.map(c => c.id));
        return next;
      });
    }

    dragIdxRef.current  = -1;
    insertAtRef.current = -1;
    Animated.timing(dragDy, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setDragIdx(-1);
      setInsertAt(-1);
    });
  }, [dragDy, reorderCategories]);

  const makeHandleProps = useCallback((idx) => ({
    onStartShouldSetResponder:        () => true,
    onMoveShouldSetResponder:         () => true,
    onStartShouldSetResponderCapture: () => true,
    onMoveShouldSetResponderCapture:  () => true,
    onResponderGrant:     (e) => startDrag(idx, e.nativeEvent.pageY),
    onResponderMove:      (e) => moveDrag(e.nativeEvent.pageY),
    onResponderRelease:   endDrag,
    onResponderTerminate: endDrag,
  }), [startDrag, moveDrag, endDrag]);

  const filtered = useMemo(() => {
    if (!search.trim()) return listItems;
    const q = search.toLowerCase();
    return listItems.filter(c => c.name.toLowerCase().includes(q));
  }, [listItems, search]);

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

  const openProfile = (cat) => {
    router.push({
      pathname: `${basePath}/[id]/category-profile`,
      params: { id: bookId, categoryId: cat.id, categoryName: cat.name },
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a category name.'); return; }
    createCategory({ name }, {
      onSuccess: () => { setAddVisible(false); setNewName(''); },
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        if (detail.includes('already exists')) {
          Alert.alert('Duplicate', 'A category with that name already exists in this book.');
        } else {
          Alert.alert('Error', 'Failed to create category.');
        }
      },
    });
  };

  // ── Render card ───────────────────────────────────────────────────────────

  const renderCategory = (item, idx) => {
    const balance  = item.net_balance ?? 0;
    const isActive = idx === dragIdx;

    const showLineBefore =
      dragIdx >= 0 && insertAt === idx && insertAt !== dragIdx && !(dragIdx + 1 === insertAt);
    const isLast       = idx === listItems.length - 1;
    const showLineAfter =
      isLast && dragIdx >= 0 && insertAt === listItems.length - 1 &&
      dragIdx !== listItems.length - 1 && dragIdx < insertAt;

    const card = (
      <Animated.View
        style={[
          s.cardWrap,
          isActive && {
            transform:     [{ translateY: dragDy }],
            zIndex:        100,
            elevation:     10,
            shadowColor:   C.primary,
            shadowOffset:  { width: 0, height: 6 },
            shadowOpacity: 0.22,
            shadowRadius:  12,
            opacity:       0.97,
          },
        ]}
      >
        <View style={[s.card, { backgroundColor: C.card, borderColor: isActive ? C.primary : C.border }]}>
          {/* Drag handle */}
          {canEdit && (
            <View {...makeHandleProps(idx)} style={s.handle}>
              <DragHandleIcon color={isActive ? C.primary : C.textMuted} />
            </View>
          )}

          {/* Icon */}
          <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name="tag" size={20} color={C.primary} />
          </View>

          {/* Body — tap to open profile */}
          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openProfile(item)}
            activeOpacity={0.8}
          >
            <Text style={[s.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[s.cardSub, { color: C.textMuted, fontFamily: Font.regular }]}>
              {item.total_in > 0 || item.total_out > 0
                ? `In: ${item.total_in.toLocaleString()}  ·  Out: ${item.total_out.toLocaleString()}`
                : 'No entries yet'}
            </Text>
          </TouchableOpacity>

          {/* Balance pill */}
          <View style={[s.balancePill, { backgroundColor: balance >= 0 ? C.cashInLight : C.dangerLight }]}>
            <Text style={[s.balanceText, { color: balance >= 0 ? C.cashIn : C.danger, fontFamily: Font.bold }]}>
              {Math.abs(balance).toLocaleString()}
            </Text>
            <Feather name="chevron-right" size={11} color={balance >= 0 ? C.cashIn : C.danger} />
          </View>
        </View>
      </Animated.View>
    );

    return (
      <Fragment key={item.id}>
        {showLineBefore && <View style={[s.insertLine, { backgroundColor: C.primary }]} />}
        {card}
        {showLineAfter  && <View style={[s.insertLine, { backgroundColor: C.primary }]} />}
      </Fragment>
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
          <Text style={[s.headerTitle, { fontFamily: Font.bold }]}>Categories</Text>
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
            Show Category Field
          </Text>
          <Text style={[s.toggleSub, { color: C.textMuted, fontFamily: Font.regular }]}>
            Category field in Cash In / Cash Out
          </Text>
        </View>
        <Switch
          value={showCategory}
          onValueChange={isOwner ? (v) => toggleCategory.mutate(v) : undefined}
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
          placeholder="Search categories…"
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
          scrollEnabled={dragIdx < 0}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.listContent}
        >
          {filtered.map((item, idx) => renderCategory(item, idx))}
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

      {/* Add Modal */}
      <Modal visible={addVisible} transparent animationType="none" statusBarTranslucent onRequestClose={() => { setAddVisible(false); setNewName(''); }}>
        <View style={s.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setAddVisible(false); setNewName(''); }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <Animated.View style={{ marginBottom: kbOffset }}>
          <View style={[s.modalSheet, { backgroundColor: C.card }]}>
            <View style={[s.modalHandle, { backgroundColor: C.border }]} />
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: C.text, fontFamily: Font.bold }]}>Add Category</Text>
              <TouchableOpacity onPress={() => { setAddVisible(false); setNewName(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, fontFamily: Font.regular }]}
              placeholder="Category name *"
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
                disabled={creating}
              >
                {creating
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
  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderWidth: 1.5 },
  handle:      { paddingHorizontal: 8, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  avatar:      { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardBody:    { flex: 1 },
  cardName:    { fontSize: 14, lineHeight: 20, marginBottom: 2 },
  cardSub:     { fontSize: 12, lineHeight: 18 },
  insertLine:  { height: 3, borderRadius: 2, marginHorizontal: 16, marginVertical: 3 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  balanceText: { fontSize: 13, lineHeight: 18 },

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
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:   { fontSize: 17, lineHeight: 26 },
  modalInput:   { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn:     { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 15, lineHeight: 22 },
});
