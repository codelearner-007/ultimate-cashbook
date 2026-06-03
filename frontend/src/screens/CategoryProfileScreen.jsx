import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import DeleteCategorySheet from '../components/ui/DeleteCategorySheet';
import SuccessDialog from '../components/ui/SuccessDialog';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import AppInput from '../components/ui/Input';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useCategories, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';

export default function CategoryProfileScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, categoryId, categoryName: paramName } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);

  // Permissions
  const { data: ownBooks = [] }    = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = ownBooks.find(b => b.id === bookId);
  const isOwner     = !!currentBook;
  const sharedBook  = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights      = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit     = rights !== 'view';
  const canDelete   = rights === 'view_create_edit_delete';

  // Category data from list cache
  const { data: categories = [], isLoading } = useCategories(bookId);
  const category = useMemo(
    () => categories.find(c => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const updateCategory = useUpdateCategory(bookId, categoryId);
  const { mutate: deleteCategory, isPending: deleting } = useDeleteCategory(bookId);

  const [name,            setName]            = useState(paramName || '');
  const [dirty,           setDirty]           = useState(false);
  const [showSuccess,     setShowSuccess]     = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDirty(false);
    }
  }, [category?.id]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a category name.'); return; }
    updateCategory.mutate(
      { name: trimmed },
      {
        onSuccess: () => { setDirty(false); setShowSuccess(true); },
        onError: (err) => {
          const detail = err?.response?.data?.detail ?? '';
          if (detail.includes('already exists')) {
            Alert.alert('Duplicate', 'A category with that name already exists in this book.');
          } else {
            Alert.alert('Error', 'Failed to save changes.');
          }
        },
      }
    );
  };

  const confirmDelete = () => {
    deleteCategory(categoryId, {
      onSuccess: () => { setShowDeleteSheet(false); router.back(); },
      onError:   () => { setShowDeleteSheet(false); Alert.alert('Error', 'Failed to delete category.'); },
    });
  };

  const openEntries = () => {
    router.push({
      pathname: `${basePath}/[id]/category-detail`,
      params: { id: bookId, categoryId, categoryName: category?.name ?? name },
    });
  };

  const totalIn    = category?.total_in    ?? 0;
  const totalOut   = category?.total_out   ?? 0;
  const netBalance = category?.net_balance ?? 0;
  const balanceColor = netBalance >= 0 ? C.cashIn : C.danger;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Category Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading && !category ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : (
          <>
            {/* Avatar card */}
            <View style={s.avatarShadow}>
              <View style={[s.avatarCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[s.avatarCircle, { backgroundColor: C.primaryLight }]}>
                  <Feather name="tag" size={20} color={C.primary} />
                </View>
                <Text style={[s.avatarName, { color: C.text }]} numberOfLines={1}>
                  {category?.name ?? name ?? '—'}
                </Text>
                <View style={[s.typeBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name="tag" size={11} color={C.primary} />
                  <Text style={[s.typeBadgeText, { color: C.primary, fontFamily: Font.semiBold }]}>Category</Text>
                </View>
              </View>
            </View>

            {/* Balance */}
            <View style={s.sectionWrap}>
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>BALANCE</Text>
              <View style={[s.balanceCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={s.balanceStat}>
                  <Text style={[s.balanceStatLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Cash In</Text>
                  <Text style={[s.balanceStatValue, { color: C.cashIn, fontFamily: Font.bold }]}>
                    {totalIn.toLocaleString()}
                  </Text>
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
                  <Text style={[s.balanceStatValue, { color: C.danger, fontFamily: Font.bold }]}>
                    {totalOut.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Category info */}
            <View style={s.sectionWrap}>
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>CATEGORY INFO</Text>
              <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <AppInput
                  label="Name"
                  value={name}
                  onChangeText={canEdit ? (v) => { setName(v); setDirty(true); } : undefined}
                  placeholder="Category name"
                  editable={canEdit}
                  isLast
                />
              </View>
            </View>

            {/* Save button */}
            {canEdit && (
              <View style={s.btnWrap}>
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: C.primary, opacity: dirty && !updateCategory.isPending ? 1 : 0.4 }]}
                  onPress={handleSave}
                  disabled={!dirty || updateCategory.isPending}
                  activeOpacity={0.85}
                >
                  <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>
                    {updateCategory.isPending ? 'Saving…' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* View All Entries */}
            <View style={s.sectionWrap}>
              <TouchableOpacity
                style={[s.viewEntriesBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={openEntries}
                activeOpacity={0.8}
              >
                <Feather name="list" size={16} color={C.primary} />
                <Text style={[s.viewEntriesText, { color: C.primary, fontFamily: Font.semiBold }]}>
                  View All Entries
                </Text>
                <Feather name="chevron-right" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>

            {/* Danger zone */}
            {canDelete && (
              <View style={s.sectionWrap}>
                <Text style={[s.sectionLabel, { color: C.textMuted }]}>DANGER ZONE</Text>
                <View style={[s.card, { backgroundColor: C.card, borderColor: C.border, overflow: 'hidden' }]}>
                  <TouchableOpacity
                    style={s.deleteRow}
                    onPress={() => setShowDeleteSheet(true)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.deleteIconWrap, { backgroundColor: C.dangerLight }]}>
                      <Feather name="trash-2" size={16} color={C.danger} />
                    </View>
                    <View style={s.deleteBody}>
                      <Text style={[s.deleteTitle, { color: C.danger, fontFamily: Font.semiBold }]}>
                        Delete Category
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
        subtitle="Category name has been updated"
      />

      <DeleteCategorySheet
        visible={showDeleteSheet}
        onDismiss={() => setShowDeleteSheet(false)}
        onConfirm={confirmDelete}
        categoryName={category?.name ?? name}
        isLoading={deleting}
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
  loadingBox:    { paddingTop: 60, alignItems: 'center' },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

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
  avatarName:    { flex: 1, fontSize: 15, fontFamily: Font.bold, lineHeight: 22 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  typeBadgeText: { fontSize: 12, lineHeight: 17 },

  sectionWrap:  { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },

  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 1, paddingVertical: 16,
  },
  balanceStat:      { flex: 1, alignItems: 'center', gap: 4 },
  balanceVDivider:  { width: 1, height: 36 },
  balanceStatLabel: { fontSize: 11, lineHeight: 16 },
  balanceStatValue: { fontSize: 15, lineHeight: 22 },
  balanceNetAmount: { fontSize: 18, lineHeight: 26 },

  card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },

  btnWrap: { marginHorizontal: 16, marginTop: 16 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  saveBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },

  viewEntriesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 16,
    paddingVertical: 15, paddingHorizontal: 16,
  },
  viewEntriesText: { fontSize: 15, lineHeight: 22, flex: 1 },

  deleteRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  deleteIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBody:  { flex: 1 },
  deleteTitle: { fontSize: 15, lineHeight: 22 },
  deleteSub:   { fontSize: 12, lineHeight: 18, marginTop: 1 },
});
