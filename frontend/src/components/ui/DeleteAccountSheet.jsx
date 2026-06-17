import { useState, useEffect } from 'react';
import { Text, TextInput, StyleSheet, Keyboard } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

const CONFIRM_WORD = 'DELETE';

/**
 * Type-to-confirm sheet for permanent account deletion.
 * The user must type DELETE to enable the confirm button. Wraps ConfirmSheet so
 * the animation + layout match every other destructive sheet in the app.
 */
export default function DeleteAccountSheet({
  visible, onDismiss, onConfirm, isLoading, C, Font, closeRef,
}) {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (visible) setInput('');
  }, [visible]);

  const matched = input.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      onBeforeClose={() => Keyboard.dismiss()}
      keyboardAware
      closeRef={closeRef}
      icon="user-x"
      confirmIcon="trash-2"
      title="Delete Account"
      subtitle="This permanently erases everything"
      confirmLabel="Delete Account"
      loadingLabel="Deleting…"
      isLoading={isLoading}
      confirmDisabled={!matched}
      confirmOpacity={matched && !isLoading ? 1 : 0.35}
      C={C}
      Font={Font}
    >
      <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
        Your account, all books, entries, contacts, categories, and uploaded files
        will be <Text style={{ fontFamily: Font.semiBold, color: C.text }}>permanently deleted</Text>.
        This cannot be undone.
      </Text>

      <Text style={[s.inputLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
        Type {CONFIRM_WORD} to confirm
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
        placeholder={CONFIRM_WORD}
        placeholderTextColor={C.textSubtle}
        autoCapitalize="characters"
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
