import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert, Modal,
  Keyboard, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useCategories, useCreateCategory } from '../../hooks/useCategories';
import SearchBar from '../ui/SearchBar';
import AppInput from '../ui/Input';

export default function CategoryPickerModal({
  visible,
  bookId,
  selectedCategoryId,
  onSelect,
  onDeselect,
  onClose,
}) {
  const { C, Font } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const insets = useSafeAreaInsets();

  const [view,      setView]      = useState('list');   // 'list' | 'create'
  const [search,    setSearch]    = useState('');
  const [newName,   setNewName]   = useState('');
  const [nameError, setNameError] = useState('');

  const { data: categories = [], isLoading } = useCategories(bookId);
  const createCategory = useCreateCategory(bookId);

  const filteredList = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { setNameError('Name is required'); return; }
    createCategory.mutate(
      { name },
      {
        onSuccess: (cat) => {
          resetAll();
          onSelect({ id: cat.id, name: cat.name });
        },
        onError: (err) => {
          const detail = err?.response?.data?.detail ?? '';
          if (detail.includes('already exists')) {
            setNameError('A category with that name already exists');
          } else {
            Alert.alert('Error', 'Failed to create category.');
          }
        },
      }
    );
  };

  const resetAll = () => {
    setView('list');
    setSearch('');
    setNewName('');
    setNameError('');
  };

  const handleClose = () => { resetAll(); onClose(); };
  const handleBack  = view === 'list' ? null : () => setView('list');
  const headerTitle = view === 'list' ? 'Select Category' : 'New Category';

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
          style={[s.sheet, { backgroundColor: C.card, marginBottom: kbHeight, paddingBottom: 20 + insets.bottom }]}
          onPress={() => {}}
        >
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* Header */}
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
              <SearchBar
                value={search}
                onChangeText={setSearch}
                onClear={() => setSearch('')}
                placeholder="Search categories…"
                style={s.searchOverride}
              />

              {selectedCategoryId && (
                <TouchableOpacity
                  style={[s.removeBtn, { borderColor: C.danger, backgroundColor: C.dangerLight }]}
                  onPress={onDeselect}
                  activeOpacity={0.8}
                >
                  <Feather name="x-circle" size={14} color={C.danger} />
                  <Text style={[s.removeBtnText, { color: C.danger, fontFamily: Font.semiBold }]}>
                    Remove selected category
                  </Text>
                </TouchableOpacity>
              )}

              {isLoading ? (
                <ActivityIndicator style={s.loader} color={C.primary} />
              ) : filteredList.length === 0 ? (
                <View style={s.empty}>
                  <Feather name="tag" size={32} color={C.border} />
                  <Text style={[s.emptyText, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {search ? 'No categories match your search.' : 'No categories yet.'}
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
                    const isSelected = item.id === selectedCategoryId;
                    const isLast     = index === filteredList.length - 1;
                    const balance    = item.net_balance ?? 0;
                    return (
                      <TouchableOpacity
                        style={[
                          s.catRow,
                          { borderBottomColor: C.border },
                          isLast && { borderBottomWidth: 0 },
                          isSelected && { backgroundColor: C.primaryLight },
                        ]}
                        onPress={() => onSelect({ id: item.id, name: item.name })}
                        activeOpacity={0.75}
                      >
                        <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
                          <Feather name="tag" size={16} color={C.primary} />
                        </View>
                        <View style={s.catBody}>
                          <Text style={[s.catName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={[s.catSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                            Balance: {balance >= 0 ? '+' : ''}{balance.toLocaleString()}
                          </Text>
                        </View>
                        {isSelected && <Feather name="check-circle" size={18} color={C.primary} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              <View style={[s.actionRow, { borderTopColor: C.border }]}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
                  onPress={() => setView('create')}
                  activeOpacity={0.8}
                >
                  <Feather name="plus-circle" size={14} color={C.primary} />
                  <Text style={[s.actionBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>New Category</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── CREATE VIEW ── */}
          {view === 'create' && (
            <View style={s.createWrap}>
              <AppInput
                label="Name *"
                value={newName}
                onChangeText={(t) => { setNewName(t); if (nameError) setNameError(''); }}
                placeholder="Category name"
                autoFocus={!newName}
                error={nameError}
                isLast
                style={{ marginTop: 8 }}
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: C.primary }, createCategory.isPending && { opacity: 0.6 }]}
                onPress={handleCreate}
                disabled={createCategory.isPending}
                activeOpacity={0.85}
              >
                {createCategory.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="plus-circle" size={16} color="#fff" />
                    <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>Add Category</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20,
    maxHeight: '78%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },

  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSideBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: 15, lineHeight: 22 },

  searchOverride: { marginHorizontal: 0, marginBottom: 0 },

  removeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 8, marginTop: 8, marginBottom: 4 },
  removeBtnText: { fontSize: 12, lineHeight: 18 },

  list:   { flexShrink: 1 },
  loader: { marginVertical: 20 },

  catRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  avatar:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  catBody: { flex: 1 },
  catName: { fontSize: 14, lineHeight: 20 },
  catSub:  { fontSize: 11, lineHeight: 16, marginTop: 1 },

  empty:     { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 220 },

  actionRow:     { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderRadius: 12, paddingVertical: 9 },
  actionBtnText: { fontSize: 13, lineHeight: 18 },

  createWrap: {},
  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  saveBtnText:{ color: '#fff', fontSize: 15, lineHeight: 22 },
});
