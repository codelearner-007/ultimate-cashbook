import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  Modal, Animated, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import Toast from '../lib/toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../hooks/useTheme';
import { apiGetEntries, apiUpdateEntry, apiDeleteEntry } from '../lib/dataSource';
import EntryForm from '../components/entry/EntryForm';
import { ChevronLeftIcon, TrashIcon } from '../components/ui/Icons';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';

export default function EditEntryScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id, eid } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const qc = useQueryClient();
  const formRef = useRef();

  const { data: books = [] } = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const isOwner = books.some(b => b.id === id);
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === id) : null;
  const rights = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit   = rights === 'view_create_edit' || rights === 'view_create_edit_delete';
  const canDelete = rights === 'view_create_edit_delete';

  const [showDeleteSheet,    setShowDeleteSheet]    = useState(false);
  const [isContactDeleted,  setIsContactDeleted]  = useState(false);
  const [isCategoryDeleted, setIsCategoryDeleted] = useState(false);
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateOpen = useCallback(() => {
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, []);

  useEffect(() => { if (showDeleteSheet) animateOpen(); }, [showDeleteSheet]);

  const openDeleteSheet  = () => setShowDeleteSheet(true);
  const closeDeleteSheet = () => animateClose(() => setShowDeleteSheet(false));

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', id],
    queryFn: () => apiGetEntries(id),
    staleTime: 1000 * 60 * 2,
    enabled: !!id,
  });

  const entry = entries.find(e => e.id === eid);

  const goToBook = () => router.replace({ pathname: `${basePath}/[id]`, params: { id } });

  const updateEntry = useMutation({
    mutationFn: (payload) => apiUpdateEntry(id, eid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      qc.invalidateQueries({ queryKey: ['report-entries', id] });
      router.back();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update entry', text2: 'Please try again.' }),
  });

  const deleteEntry = useMutation({
    mutationFn: () => apiDeleteEntry(id, eid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      qc.invalidateQueries({ queryKey: ['report-entries', id] });
      animateClose(() => { setShowDeleteSheet(false); goToBook(); });
    },
    onError: () => {
      animateClose(() => setShowDeleteSheet(false));
      Toast.show({ type: 'error', text1: 'Failed to delete entry', text2: 'Please try again.' });
    },
  });

  const handleUpdate = () => {
    const err = formRef.current?.validate();
    if (err === 'amount') {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Please enter a valid amount.' });
      return;
    }
    if (err === 'payment_mode') {
      Toast.show({ type: 'error', text1: 'Payment mode required', text2: 'Please select a payment mode.' });
      return;
    }
    if (err) return;
    updateEntry.mutate(formRef.current.getValues());
  };

  const handleDelete = () => openDeleteSheet();

  if (!entry) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: Font.regular, color: C.textMuted, fontSize: 14 }}>
            Entry not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ChevronLeftIcon color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Entry</Text>
        {canDelete ? (
          <TouchableOpacity
            onPress={handleDelete}
            style={s.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={deleteEntry.isPending}
            activeOpacity={0.75}
          >
            <TrashIcon color="#fff" size={16} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <EntryForm ref={formRef} bookId={id} initialValues={entry} showTypeToggle onContactDeletedChange={setIsContactDeleted} onCategoryDeletedChange={setIsCategoryDeleted} />

      {canEdit && (
        <View style={s.saveContainer}>
          <TouchableOpacity
            style={[s.saveBtn, (updateEntry.isPending || deleteEntry.isPending || isContactDeleted || isCategoryDeleted) && { opacity: 0.45 }]}
            onPress={handleUpdate}
            disabled={updateEntry.isPending || deleteEntry.isPending || isContactDeleted || isCategoryDeleted}
            activeOpacity={0.85}
          >
            <Text style={s.saveBtnText}>{updateEntry.isPending ? 'SAVING…' : 'UPDATE'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {showDeleteSheet && (
        <Modal transparent visible animationType="none" onRequestClose={closeDeleteSheet} statusBarTranslucent>
          <Animated.View style={[StyleSheet.absoluteFill, s.dimBg, { opacity: bgOpacity }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeDeleteSheet} />
          </Animated.View>

          <Animated.View style={s.sheetWrap}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeDeleteSheet} />
            <Animated.View style={[s.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
              <View style={[s.sheetHandle, { backgroundColor: C.border }]} />

              <View style={s.sheetHeaderRow}>
                <View style={[s.sheetIconCircle, { backgroundColor: C.danger }]}>
                  <Feather name="trash-2" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sheetTitle, { color: C.text, fontFamily: Font.bold }]}>Delete Entry</Text>
                  <Text style={[s.sheetSubtitle, { color: C.danger, fontFamily: Font.medium }]}>This cannot be undone</Text>
                </View>
              </View>

              <Text style={[s.sheetBody, { color: C.textMuted, fontFamily: Font.regular }]}>
                This entry will be permanently deleted and the book balance will be updated accordingly.
              </Text>

              <View style={s.sheetBtnRow}>
                <TouchableOpacity
                  style={[s.sheetBtn, { borderColor: C.border }]}
                  onPress={closeDeleteSheet}
                  activeOpacity={0.8}
                >
                  <Text style={[s.sheetBtnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.sheetBtn, s.sheetBtnDelete, { backgroundColor: C.danger, opacity: deleteEntry.isPending ? 0.6 : 1 }]}
                  onPress={() => deleteEntry.mutate()}
                  disabled={deleteEntry.isPending}
                  activeOpacity={0.85}
                >
                  {deleteEntry.isPending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="trash-2" size={15} color="#fff" />
                  }
                  <Text style={[s.sheetBtnText, { color: '#fff', fontFamily: Font.bold }]}>
                    {deleteEntry.isPending ? 'Deleting…' : 'Delete Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  headerBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: Font.bold, color: '#fff', lineHeight: 24, textAlign: 'center' },

  saveContainer: {
    padding: 16, borderTopWidth: 1,
    backgroundColor: C.card, borderTopColor: C.border,
  },
  saveBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 52, backgroundColor: C.primary },
  saveBtnText: { color: '#fff', fontFamily: Font.extraBold, fontSize: 14, letterSpacing: 0.8, lineHeight: 20 },

  dimBg:     { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sheetIconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.danger, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  sheetTitle:    { fontSize: 16, lineHeight: 22 },
  sheetSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  sheetBody:     { fontSize: 13, lineHeight: 19, marginBottom: 22, paddingHorizontal: 2 },
  sheetBtnRow:   { flexDirection: 'row', gap: 10 },
  sheetBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  sheetBtnDelete: { borderWidth: 0 },
  sheetBtnText:   { fontSize: 14 },
});
