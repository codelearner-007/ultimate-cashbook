import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ConfirmSheet from './ConfirmSheet';

export default function DeleteAllEntriesSheet({
  visible, onDismiss, onConfirm, bookName, entryCount, isLoading, C, Font, closeRef,
}) {
  const [input, setInput] = useState('');
  // ConfirmSheet writes its animateClose into this ref; we mirror it onto the
  // caller-supplied closeRef and use it for the empty-state "Got it" button.
  const innerCloseRef = useRef(null);

  useEffect(() => {
    if (closeRef) closeRef.current = innerCloseRef.current;
  });

  useEffect(() => {
    if (visible) setInput('');
  }, [visible]);

  const isEmpty = entryCount === 0;
  const matched = input.trim() === bookName?.trim();

  if (isEmpty) {
    return (
      <ConfirmSheet
        visible={visible}
        onDismiss={onDismiss}
        onConfirm={onConfirm}
        onBeforeClose={() => Keyboard.dismiss()}
        keyboardAware
        closeRef={innerCloseRef}
        hideHeader
        footer={(
          <TouchableOpacity
            style={[s.closeBtn, { backgroundColor: C.primaryLight }]}
            onPress={() => { Keyboard.dismiss(); innerCloseRef.current?.(onDismiss); }}
            activeOpacity={0.8}
          >
            <Text style={[s.closeBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>Got it</Text>
          </TouchableOpacity>
        )}
        C={C}
        Font={Font}
      >
        <View style={s.emptyWrap}>
          <View style={[s.emptyIconCircle, { backgroundColor: C.primaryLight }]}>
            <Feather name="inbox" size={28} color={C.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: C.text, fontFamily: Font.bold }]}>
            Nothing to Delete
          </Text>
          <Text style={[s.emptyBody, { color: C.textMuted, fontFamily: Font.regular }]}>
            <Text style={{ fontFamily: Font.semiBold, color: C.text }}>"{bookName}"</Text>
            {' '}has no entries yet. Add some Cash In or Cash Out entries first.
          </Text>
        </View>
      </ConfirmSheet>
    );
  }

  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      onBeforeClose={() => Keyboard.dismiss()}
      keyboardAware
      closeRef={innerCloseRef}
      icon="trash-2"
      title="Delete All Entries"
      confirmLabel="Delete All"
      loadingLabel="Deleting…"
      isLoading={isLoading}
      confirmDisabled={!matched}
      confirmOpacity={matched && !isLoading ? 1 : 0.35}
      C={C}
      Font={Font}
    >
      <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
        All entries in{' '}
        <Text style={{ fontFamily: Font.semiBold, color: C.text }}>"{bookName}"</Text>
        {' '}will be permanently deleted. The book stays, entries are gone.
      </Text>

      <Text style={[s.inputLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
        Type the book name to confirm
      </Text>
      <TextInput
        style={[
          s.input,
          {
            borderColor: input.length > 0 ? (matched ? C.cashIn : C.danger) : C.border,
            color: C.text,
            backgroundColor: C.background,
            fontFamily: Font.regular,
          },
        ]}
        value={input}
        onChangeText={setInput}
        placeholder={bookName}
        placeholderTextColor={C.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </ConfirmSheet>
  );
}

const s = StyleSheet.create({
  // Delete form
  body:       { fontSize: 13, lineHeight: 19, marginBottom: 18, paddingHorizontal: 2 },
  inputLabel: { fontSize: 12, marginBottom: 7 },
  input: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, marginBottom: 18,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 12, marginBottom: 20 },
  emptyIconCircle: {
    width: 64, height: 64, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, marginBottom: 8 },
  emptyBody:  { fontSize: 13, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  closeBtn: {
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14 },
});
