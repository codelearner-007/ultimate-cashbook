import { useState, useEffect } from 'react';
import { Text, TextInput, StyleSheet, Keyboard } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

export default function DeleteBookSheet({
  visible, onDismiss, onConfirm, bookName, isLoading, C, Font, closeRef,
}) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (visible) setInput('');
  }, [visible]);

  const matched = input.trim() === bookName?.trim();

  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      onBeforeClose={() => Keyboard.dismiss()}
      keyboardAware
      closeRef={closeRef}
      icon="book"
      confirmIcon="trash-2"
      title="Delete Book"
      confirmLabel="Delete Book"
      loadingLabel="Deleting…"
      isLoading={isLoading}
      confirmDisabled={!matched}
      confirmOpacity={matched && !isLoading ? 1 : 0.35}
      C={C}
      Font={Font}
    >
      <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
        <Text style={{ fontFamily: Font.semiBold, color: C.text }}>"{bookName}"</Text>
        {' '}and all its entries will be permanently deleted. This action cannot be reversed.
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
  body:       { fontSize: 13, lineHeight: 19, marginBottom: 18, paddingHorizontal: 2 },
  inputLabel: { fontSize: 12, marginBottom: 7 },
  input: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, marginBottom: 18,
  },
});
