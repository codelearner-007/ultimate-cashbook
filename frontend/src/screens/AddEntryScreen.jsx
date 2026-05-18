import React, { useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import Toast from '../lib/toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../hooks/useTheme';
import { apiCreateEntry } from '../lib/dataSource';
import EntryForm from '../components/entry/EntryForm';
import { ChevronLeftIcon } from '../components/ui/Icons';

export default function AddEntryScreen() {
  const router = useRouter();
  const { id, type } = useLocalSearchParams();
  const { C, Font } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const qc = useQueryClient();
  const formRef = useRef();

  const createEntry = useMutation({
    mutationFn: (payload) => apiCreateEntry(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      qc.invalidateQueries({ queryKey: ['report-entries', id] });
      router.back();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to save entry', text2: 'Please try again.' }),
  });

  const handleSave = () => {
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
    createEntry.mutate(formRef.current.getValues());
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ChevronLeftIcon color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{type === 'in' ? 'Cash In' : 'Cash Out'}</Text>
        <View style={{ width: 44 }} />
      </View>

      <EntryForm ref={formRef} bookId={id} initialType={type} autoFocusAmount />

      <View style={s.saveContainer}>
        <TouchableOpacity
          style={[s.saveBtn, createEntry.isPending && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={createEntry.isPending}
          activeOpacity={0.85}
        >
          <Text style={s.saveBtnText}>{createEntry.isPending ? 'SAVING…' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  headerBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: Font.bold, color: '#fff', lineHeight: 24, textAlign: 'center' },

  saveContainer: {
    padding: 16, borderTopWidth: 1,
    backgroundColor: C.card, borderTopColor: C.border,
  },
  saveBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 52, backgroundColor: C.primary },
  saveBtnText: { color: '#fff', fontFamily: Font.extraBold, fontSize: 14, letterSpacing: 0.8, lineHeight: 20 },
});
