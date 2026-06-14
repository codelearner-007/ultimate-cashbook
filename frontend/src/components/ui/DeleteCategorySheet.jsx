import { Text, StyleSheet } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

export default function DeleteCategorySheet({
  visible, onDismiss, onConfirm, categoryName, isLoading, C, Font,
}) {
  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      icon="trash-2"
      title="Delete Category"
      confirmLabel="Delete Category"
      loadingLabel="Deleting…"
      isLoading={isLoading}
      C={C}
      Font={Font}
    >
      <Text style={[s.body, { color: C.textMuted, fontFamily: Font.regular }]}>
        <Text style={{ fontFamily: Font.semiBold, color: C.text }}>"{categoryName}"</Text>
        {' '}will be removed. Linked entries will keep the name for historical reference.
      </Text>
    </ConfirmSheet>
  );
}

const s = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19, marginBottom: 20, paddingHorizontal: 2 },
});
