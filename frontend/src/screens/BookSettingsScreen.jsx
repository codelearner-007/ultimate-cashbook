import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  StatusBar, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useBooks, useRenameBook, useDeleteBook } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useRealtimeEntries, useRealtimeBookSettings } from '../hooks/useRealtimeSync';
import { useCustomers, useSuppliers } from '../hooks/useContacts';
import { useCategories } from '../hooks/useCategories';
import { usePaymentModes } from '../hooks/usePaymentModes';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiDeleteAllEntries, apiGetEntries, apiUpdateBookFieldSettings } from '../lib/dataSource';
import { useAuthStore } from '../store/authStore';
import { canAccess } from '../lib/canAccess';
import CrownBadge from '../components/ui/CrownBadge';

import SuccessDialog from '../components/ui/SuccessDialog';
import DeleteAllEntriesSheet from '../components/ui/DeleteAllEntriesSheet';
import DeleteBookSheet from '../components/ui/DeleteBookSheet';

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BookSettingsScreen() {
  const router = useRouter();
  const basePath = useBookBasePath();
  const { id, name } = useLocalSearchParams();
  const { C, Font } = useTheme();
  const s = makeStyles(C, Font);

  const [bookName, setBookName] = useState(name || 'Unnamed Book');
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const deleteSheetCloseRef = useRef(null);
  const [showDeleteBookSheet, setShowDeleteBookSheet] = useState(false);
  const deleteBookSheetCloseRef = useRef(null);

  const qc = useQueryClient();
  useRealtimeEntries(id);
  useRealtimeBookSettings(id);
  const { data: books = [] } = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = books.find(b => b.id === id);
  const isOwner = !!currentBook;

  // Polling fallback for collaborators — Realtime nested-RLS can silently fail,
  // so poll every 3 s to guarantee field-settings changes appear for all users.
  useEffect(() => {
    if (isOwner) return;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: ['shared-books'] }), 3000);
    return () => clearInterval(t);
  }, [isOwner, qc]);
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === id) : null;
  const canEdit  = isOwner || (sharedBook?.rights ?? 'view') !== 'view';
  const bookData = currentBook ?? sharedBook;
  const authUser = useAuthStore(s => s.user);
  const canShare = canAccess(authUser, 'book_sharing');
  const fields = {
    showCustomer:   bookData?.show_customer   ?? false,
    showSupplier:   bookData?.show_supplier   ?? false,
    showCategory:   bookData?.show_category   ?? false,
    showAttachment: bookData?.show_attachment ?? false,
  };

  const saveFieldSettings = useMutation({
    mutationFn: (newFields) => apiUpdateBookFieldSettings(id, newFields),
    onMutate: async (newFields) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      await qc.cancelQueries({ queryKey: cacheKey });
      const snapshot = qc.getQueryData(cacheKey);
      qc.setQueryData(cacheKey, (prev = []) =>
        prev.map(b => b.id === id ? {
          ...b,
          show_customer:   newFields.showCustomer,
          show_supplier:   newFields.showSupplier,
          show_category:   newFields.showCategory,
          show_attachment: newFields.showAttachment,
        } : b)
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      if (ctx?.snapshot !== undefined) qc.setQueryData(cacheKey, ctx.snapshot);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: isOwner ? ['books'] : ['shared-books'] });
    },
  });

  const handleSetField = (bookId, fieldKey, val) => {
    saveFieldSettings.mutate({ ...fields, [fieldKey]: val });
  };

  const renameBook = useRenameBook();

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', id],
    queryFn: () => apiGetEntries(id),
    staleTime: 1000 * 60 * 2,
    enabled: !!id,
  });

  const { data: customers = [] }    = useCustomers(id);
  const { data: suppliers = [] }    = useSuppliers(id);
  const { data: categories = [] }   = useCategories(id);
  const { data: paymentModes = [] } = usePaymentModes(id);

  const deleteBook = useDeleteBook();

  const handleDeleteBook = () => {
    deleteBook.mutate(id, {
      onSuccess: () => {
        deleteBookSheetCloseRef.current?.(() => {
          setShowDeleteBookSheet(false);
          router.replace(basePath);
        });
      },
      onError: () => {
        Alert.alert('Error', 'Could not delete book. Please try again.');
      },
    });
  };

  const deleteAllEntries = useMutation({
    mutationFn: () => apiDeleteAllEntries(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      deleteSheetCloseRef.current?.(() => {
        setShowDeleteSheet(false);
        setShowDeleteSuccess(true);
      });
    },
    onError: () => {
      Alert.alert('Error', 'Could not delete entries. Please try again.');
    },
  });

  const openRename = () => {
    setRenameInput(bookName);
    setRenameVisible(true);
  };

  const confirmRename = () => {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    const previous = bookName;
    setRenameVisible(false);
    setBookName(trimmed);
    renameBook.mutate(
      { bookId: id, name: trimmed },
      {
        onSuccess: () => setShowSuccess(true),
        onError: () => {
          setBookName(previous);
          Alert.alert('Rename Failed', 'Could not rename the book. Please try again.');
        },
      },
    );
  };

  const ENTRY_FIELDS = [
    {
      icon: 'user-check',
      label: 'Customers',
      sub: 'Manage customers for this book',
      count: customers.length,
      fieldKey: 'showCustomer',
      route: `${basePath}/[id]/customers`,
      params: { type: 'customer' },
    },
    {
      icon: 'truck',
      label: 'Suppliers',
      sub: 'Manage suppliers for this book',
      count: suppliers.length,
      fieldKey: 'showSupplier',
      route: `${basePath}/[id]/suppliers`,
      params: { type: 'supplier' },
    },
    {
      icon: 'tag',
      label: 'Categories',
      sub: 'Manage categories for this book',
      count: categories.length,
      fieldKey: 'showCategory',
      route: `${basePath}/[id]/categories-settings`,
      params: {},
    },
    {
      icon: 'credit-card',
      label: 'Payment Mode',
      sub: 'Manage payment methods for this book',
      count: paymentModes.length,
      alwaysActive: true,
      route: `${basePath}/[id]/payment-mode-settings`,
      params: {},
    },
    {
      icon: 'paperclip',
      label: 'Attachments',
      sub: 'Allow image or PDF on each entry',
      fieldKey: 'showAttachment',
      hasToggleOnly: true,
    },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Book Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Book Name */}
        <Text style={s.sectionLabel}>BOOK NAME</Text>
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.nameRow}>
            <View style={s.nameIconBox}>
              <Feather name="book-open" size={18} color={C.primary} />
            </View>
            <View style={s.nameBody}>
              <Text style={s.nameValue}>{bookName}</Text>
              <Text style={s.nameSub}>Tap rename to change</Text>
            </View>
            {isOwner && (
              <TouchableOpacity style={s.renameBtn} onPress={openRename} activeOpacity={0.8}>
                <Feather name="edit-2" size={13} color={C.primary} />
                <Text style={s.renameBtnText}>Rename</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Entry Field Settings */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>ENTRY FIELD SETTINGS</Text>
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {ENTRY_FIELDS.map((item, idx) => (
            <View key={item.label}>
              {item.hasToggleOnly ? (
                <View style={s.row}>
                  <View style={[s.iconBox, { backgroundColor: fields[item.fieldKey] ? C.primaryLight : C.inputBg }]}>
                    <Feather name={item.icon} size={18} color={fields[item.fieldKey] ? C.primary : C.textMuted} />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowLabel}>{item.label}</Text>
                    <Text style={s.rowSub}>{item.sub}</Text>
                  </View>
                  <Switch
                    value={fields[item.fieldKey] ?? false}
                    onValueChange={canEdit ? (val) => handleSetField(id, item.fieldKey, val) : undefined}
                    disabled={!canEdit}
                    trackColor={{ false: C.border, true: C.primary }}
                    thumbColor="#fff"
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={s.row}
                  onPress={() => router.push({ pathname: item.route, params: { id, name: bookName, ...(item.params || {}) } })}
                  activeOpacity={0.75}
                >
                  <View style={[s.iconBox, { backgroundColor: C.primaryLight }]}>
                    <Feather name={item.icon} size={18} color={C.primary} />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowLabel}>{item.label}</Text>
                    <Text style={s.rowSub}>{item.sub}</Text>
                  </View>
                  {item.count != null && (
                    <View style={[s.countBadge, { backgroundColor: C.primaryLight }]}>
                      <Text style={[s.countBadgeText, { color: C.primary }]}>{item.count}</Text>
                    </View>
                  )}
                  {(item.alwaysActive || (item.fieldKey != null && fields[item.fieldKey])) ? (
                    <View style={s.arrowActive}>
                      <Feather name="chevron-right" size={15} color={C.primary} />
                    </View>
                  ) : (
                    <Feather name="chevron-right" size={18} color={C.textSubtle} />
                  )}
                </TouchableOpacity>
              )}
              {idx < ENTRY_FIELDS.length - 1 && (
                <View style={[s.divider, { backgroundColor: C.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* Sharing — only shown to the book owner */}
        {isOwner && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>COLLABORATION</Text>
            <View style={[s.card, { backgroundColor: C.card, borderColor: canShare ? C.border : '#F59E0B44' }]}>
              <TouchableOpacity
                style={s.row}
                onPress={() => {
                  if (!canShare) { router.push('/(app)/settings/subscription'); return; }
                  router.push({ pathname: `${basePath}/[id]/manage-shares`, params: { id, name: bookName } });
                }}
                activeOpacity={0.75}
              >
                <View style={[s.iconBox, { backgroundColor: canShare ? C.primaryLight : '#F59E0B1A' }]}>
                  <Feather name="users" size={18} color={canShare ? C.primary : '#F59E0B'} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowLabel, { color: canShare ? C.text : '#F59E0B' }]}>Manage Access</Text>
                  <Text style={s.rowSub}>
                    {canShare ? 'Share this book with other users' : 'Requires Pro or Business plan'}
                  </Text>
                </View>
                {canShare
                  ? <View style={s.arrowActive}><Feather name="chevron-right" size={15} color={C.primary} /></View>
                  : <CrownBadge tier="pro" size={11} />
                }
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Danger Zone — only shown to the book owner */}
        {isOwner && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>DANGER ZONE</Text>
            <View style={[s.card, { backgroundColor: C.card, borderColor: C.danger }]}>
              <TouchableOpacity
                style={s.row}
                onPress={() => setShowDeleteSheet(true)}
                activeOpacity={0.75}
              >
                <View style={[s.iconBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="trash-2" size={18} color={C.danger} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowLabel, { color: C.danger }]}>Delete All Entries</Text>
                  <Text style={s.rowSub}>Permanently removes all entries from this book</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.danger} />
              </TouchableOpacity>
              <View style={[s.divider, { backgroundColor: C.border }]} />
              <TouchableOpacity
                style={s.row}
                onPress={() => setShowDeleteBookSheet(true)}
                activeOpacity={0.75}
              >
                <View style={[s.iconBox, { backgroundColor: C.dangerLight }]}>
                  <Feather name="book" size={18} color={C.danger} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowLabel, { color: C.danger }]}>Delete Book</Text>
                  <Text style={s.rowSub}>Permanently deletes this book and all its entries</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.danger} />
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>

      {/* Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={s.modalTitle}>Rename Book</Text>
            <TextInput
              style={[s.modalInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Book name"
              placeholderTextColor={C.textSubtle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: C.border }]}
                onPress={() => setRenameVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={[s.modalBtnText, { color: C.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnPrimary, { backgroundColor: C.primary }]}
                onPress={confirmRename}
                activeOpacity={0.85}
              >
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title="Book Renamed!"
        subtitle={`"${bookName}" has been saved successfully`}
      />

      <DeleteAllEntriesSheet
        visible={showDeleteSheet}
        onDismiss={() => setShowDeleteSheet(false)}
        onConfirm={() => deleteAllEntries.mutate()}
        bookName={bookName}
        entryCount={entries.length}
        isLoading={deleteAllEntries.isPending}
        C={C}
        Font={Font}
        closeRef={deleteSheetCloseRef}
      />

      <SuccessDialog
        visible={showDeleteSuccess}
        onDismiss={() => setShowDeleteSuccess(false)}
        title="All Entries Deleted"
        subtitle={`"${bookName}" has been cleared successfully`}
      />

      <DeleteBookSheet
        visible={showDeleteBookSheet}
        onDismiss={() => setShowDeleteBookSheet(false)}
        onConfirm={handleDeleteBook}
        bookName={bookName}
        isLoading={deleteBook.isPending}
        C={C}
        Font={Font}
        closeRef={deleteBookSheetCloseRef}
      />
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
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  content:      { padding: 16, paddingTop: 24, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, color: C.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },
  card:    { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },

  // Name row
  nameRow:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  nameIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  nameBody:   { flex: 1 },
  nameValue:  { fontSize: 15, fontFamily: Font.semiBold, color: C.text, lineHeight: 22 },
  nameSub:    { fontSize: 12, fontFamily: Font.regular, color: C.textMuted, lineHeight: 18 },
  renameBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: C.primaryLight,
  },
  renameBtnText: { fontSize: 13, fontFamily: Font.semiBold, color: C.primary },

  // Entry field rows
  row:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  divider: { height: 1, marginHorizontal: 16 },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody:  { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: Font.semiBold, color: C.text, lineHeight: 22, marginBottom: 2 },
  rowSub:   { fontSize: 12, fontFamily: Font.regular, color: C.textMuted, lineHeight: 18 },
  arrowActive: {
    backgroundColor: C.primaryLight,
    borderRadius: 8, padding: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  countBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, marginRight: 8,
  },
  countBadgeText: { fontSize: 13, fontFamily: Font.bold },

  // Rename modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard:  {
    width: '100%', borderRadius: 20, borderWidth: 1,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: Font.bold, color: C.text, marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: Font.regular,
    marginBottom: 20,
  },
  modalActions:      { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  modalBtnPrimary:   { borderWidth: 0 },
  modalBtnText:      { fontSize: 15, fontFamily: Font.semiBold },
});
