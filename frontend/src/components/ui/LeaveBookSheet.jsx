import { Text, StyleSheet } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

export default function LeaveBookSheet({
  visible, onDismiss, onConfirm, bookName, isLoading, C, Font,
}) {
  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      icon="log-out"
      title="Leave Book"
      subtitle="This can only be undone by the owner"
      confirmLabel="Leave Book"
      loadingLabel="Leaving…"
      isLoading={isLoading}
      C={C}
      Font={Font}
    >
      <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
        {'You will lose access to '}
        <Text style={{ fontFamily: Font.semiBold, color: C.text }}>"{bookName}"</Text>
        {'. You will no longer be able to view or edit entries in this book.'}
      </Text>
    </ConfirmSheet>
  );
}

const s = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19, marginBottom: 22, paddingHorizontal: 2 },
});
