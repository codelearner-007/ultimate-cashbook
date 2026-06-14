import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Modal, Alert, ActivityIndicator, Animated,
  Keyboard, Platform, TextInput, Switch,
} from 'react-native';
import SafeAreaView from '../ui/AppSafeAreaView';
import SearchBar from '../ui/SearchBar';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle, C, Font }) {
  return (
    <View style={es.wrap}>
      <View style={[es.iconBox, { backgroundColor: C.primaryLight }]}>
        <Feather name={icon} size={36} color={C.primary} />
      </View>
      <Text style={[es.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>
      <Text style={[es.sub, { color: C.textMuted, fontFamily: Font.regular }]}>{subtitle}</Text>
    </View>
  );
}

const es = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  iconBox: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title:   { fontSize: 16, lineHeight: 24, marginBottom: 8 },
  sub:     { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});

// ── Reorder arrows (left strip inside each card) ───────────────────────────────
// Exposed to callers via the render-card `helpers` so every entity card draws the
// identical up/down control with no duplication.

export function ReorderArrows({ idx, isFirst, isLast, moveItem, s, C }) {
  return (
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
  );
}

// ── Shared settings-list scaffold ──────────────────────────────────────────────
//
// Drives CategoriesSettingsScreen, ContactsListScreen, PaymentModeSettingsScreen.
// Owns the header, optional field-visibility toggle, search, drag-reorder local
// list state, FAB + empty-state animations, keyboard-aware add modal, and the
// loading/empty/no-results branches. Per-entity specifics are passed in:
//
//   title            – header title
//   bookName         – header subtitle (book name)
//   items            – server list (synced into local reorder state)
//   isLoading        – list loading flag
//   canEdit          – gates reorder arrows + FAB + add modal
//   searchPlaceholder
//   filterItem(item, q) – predicate for the search filter (q is lowercased)
//   reorder(orderedIds) – mutation fn called with the reordered id list
//   onCreate({ values }, { onSuccess, onError }) – create mutation invocation
//   creating         – create-mutation pending flag
//   addTitle         – add-modal title
//   addFields        – [{ key, placeholder, keyboardType?, returnKeyType?, submitOnEnter?, required?, requiredMsg? }]
//   emptyIcon/emptyTitle/emptySubtitle – empty-state copy
//   toggle           – optional { label, sublabel, value, enabled, onChange } field-visibility row
//   renderCard(item, idx, helpers) – per-entity card; helpers = { s, C, Font, moveItem, isFiltering, listLength }
//   children         – render-prop or node for extra sheets (menu/delete); receives nothing
//
export default function EntityListScreen({
  title,
  bookName,
  items = [],
  isLoading,
  canEdit,
  searchPlaceholder,
  filterItem,
  reorder,
  onCreate,
  creating,
  addTitle,
  addFields = [],
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  toggle,
  renderCard,
  children,
  modalHeaderMb = 20,
  modalInputMb = 12,
}) {
  const router = useRouter();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(), []);

  const [search, setSearch] = useState('');

  // Add-modal field values keyed by field.key
  const blankValues = useMemo(
    () => addFields.reduce((acc, f) => { acc[f.key] = ''; return acc; }, {}),
    [addFields],
  );
  const [addVisible, setAddVisible] = useState(false);
  const [values, setValues] = useState(blankValues);

  const resetAdd = useCallback(() => {
    setAddVisible(false);
    setValues(blankValues);
  }, [blankValues]);

  // ── Keyboard-aware add modal ────────────────────────────────────────────────
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

  // ── Local reorder list (synced from server) ─────────────────────────────────
  const [listItems, setListItems] = useState(() => [...items]);
  useEffect(() => {
    setListItems([...items]);
  }, [items]);

  const moveItem = useCallback((idx, direction) => {
    setListItems(prev => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      reorder(next.map(i => i.id));
      return next;
    });
  }, [reorder]);

  const filtered = useMemo(() => {
    if (!search.trim()) return listItems;
    const q = search.toLowerCase();
    return listItems.filter(item => filterItem(item, q));
  }, [listItems, search, filterItem]);

  const isFiltering = search.trim().length > 0;
  const isEmpty = !isLoading && listItems.length === 0;

  // ── FAB animations ──────────────────────────────────────────────────────────
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

  // ── Create handler ──────────────────────────────────────────────────────────
  const handleCreate = () => {
    for (const f of addFields) {
      if (f.required && !values[f.key]?.trim()) {
        Alert.alert(f.requiredTitle || 'Name required', f.requiredMsg || 'Please enter a name.');
        return;
      }
    }
    onCreate(
      { values },
      { onSuccess: resetAdd },
    );
  };

  const cardHelpers = { s, C, Font, moveItem, isFiltering, listLength: listItems.length };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: C.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { fontFamily: Font.bold }]}>{title}</Text>
          {bookName ? <Text style={[s.headerSub, { fontFamily: Font.regular }]}>{bookName}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Field visibility toggle (optional) */}
      {toggle && (
        <View style={[s.toggleRow, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <View style={[s.toggleIconBox, { backgroundColor: C.primaryLight }]}>
            <Feather name="edit-3" size={15} color={C.primary} />
          </View>
          <View style={s.toggleBody}>
            <Text style={[s.toggleLabel, { color: C.text, fontFamily: Font.semiBold }]}>
              {toggle.label}
            </Text>
            <Text style={[s.toggleSub, { color: C.textMuted, fontFamily: Font.regular }]}>
              {toggle.sublabel}
            </Text>
          </View>
          <Switch
            value={toggle.value}
            onValueChange={toggle.enabled ? toggle.onChange : undefined}
            disabled={!toggle.enabled}
            trackColor={{ false: C.border, true: C.primary }}
            thumbColor="#fff"
          />
        </View>
      )}

      {/* Search */}
      <View style={[s.searchWrap, { borderBottomColor: C.border }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={searchPlaceholder}
          onClear={() => setSearch('')}
        />
      </View>

      {/* List / empty states */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
      ) : isEmpty ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} C={C} Font={Font} />
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
          {filtered.map((item, idx) => renderCard(item, idx, cardHelpers))}
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

      {/* Extra sheets (menu / delete) supplied by the caller */}
      {typeof children === 'function' ? children() : children}

      {/* Add Modal */}
      <Modal visible={addVisible} transparent animationType="none" statusBarTranslucent onRequestClose={resetAdd}>
        <View style={s.modalRoot}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={resetAdd} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
          <Animated.View style={{ marginBottom: kbOffset }}>
          <View style={[s.modalSheet, { backgroundColor: C.card }]}>
            <View style={[s.modalHandle, { backgroundColor: C.border }]} />
            <View style={[s.modalHeader, { marginBottom: modalHeaderMb }]}>
              <Text style={[s.modalTitle, { color: C.text, fontFamily: Font.bold }]}>{addTitle}</Text>
              <TouchableOpacity onPress={resetAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {addFields.map((f, i) => (
              <TextInput
                key={f.key}
                style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, fontFamily: Font.regular, marginBottom: modalInputMb }]}
                placeholder={f.placeholder}
                placeholderTextColor={C.textMuted}
                value={values[f.key]}
                onChangeText={(t) => setValues(prev => ({ ...prev, [f.key]: t }))}
                autoFocus={i === 0}
                keyboardType={f.keyboardType}
                returnKeyType={f.returnKeyType}
                onSubmitEditing={f.submitOnEnter ? handleCreate : undefined}
              />
            ))}

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: C.border }]}
                onPress={resetAdd}
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
  arrowCol:    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 36, alignSelf: 'stretch', borderRightWidth: 1, marginRight: 8 },
  arrowBtn:    { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  arrowDivider:{ width: '100%', height: 1 },
  avatar:       { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardBody:     { flex: 1 },
  cardName:     { fontSize: 14, lineHeight: 20 },
  cardSub:      { fontSize: 12, lineHeight: 18 },
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
