import { View, Text, StyleSheet } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

/**
 * Bottom-sheet confirmation for deleting a single entry.
 * No text-input confirmation required — simpler than DeleteBookSheet.
 *
 * Props:
 *   visible    — controls visibility
 *   entry      — { type, amount, remark, entry_date } (can be null while animating out)
 *   isLoading  — show spinner on Delete button while mutation is pending
 *   onDismiss  — called after the sheet animates closed (cancel or backdrop tap)
 *   onConfirm  — called when the user taps Delete
 *   C, Font    — theme tokens
 */
export default function DeleteEntrySheet({
  visible, entry, isLoading, onDismiss, onConfirm, C, Font,
}) {
  const isIn   = entry?.type === 'in';
  const amount = entry?.amount != null
    ? Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const typeLabel  = isIn ? 'Cash In' : 'Cash Out';
  const typeColor  = isIn ? C.cashIn : C.danger;

  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      icon="trash-2"
      title="Delete Entry"
      headerStyle={s.headerRow}
      confirmLabel="Delete Entry"
      loadingLabel="Deleting…"
      isLoading={isLoading}
      confirmOpacity={isLoading ? 0.7 : 1}
      cancelDisabled={isLoading}
      C={C}
      Font={Font}
    >
      {/* Entry preview */}
      <View style={[s.previewCard, { backgroundColor: C.background, borderColor: C.border }]}>
        <View style={s.previewRow}>
          <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Type</Text>
          <Text style={[s.previewValue, { color: typeColor, fontFamily: Font.semiBold }]}>{typeLabel}</Text>
        </View>
        <View style={[s.previewDivider, { backgroundColor: C.border }]} />
        <View style={s.previewRow}>
          <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Amount</Text>
          <Text style={[s.previewValue, { color: C.text, fontFamily: Font.bold }]}>{amount}</Text>
        </View>
        {!!entry?.remark && (
          <>
            <View style={[s.previewDivider, { backgroundColor: C.border }]} />
            <View style={s.previewRow}>
              <Text style={[s.previewLabel, { color: C.textMuted, fontFamily: Font.regular }]}>Note</Text>
              <Text style={[s.previewValue, { color: C.text, fontFamily: Font.regular }]} numberOfLines={2}>
                {entry.remark}
              </Text>
            </View>
          </>
        )}
      </View>
    </ConfirmSheet>
  );
}

const s = StyleSheet.create({
  headerRow: { marginBottom: 16 },

  previewCard: {
    borderRadius: 14, borderWidth: 1.5,
    marginBottom: 20, overflow: 'hidden',
  },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  previewDivider: { height: 1 },
  previewLabel:   { fontSize: 13 },
  previewValue:   { fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
