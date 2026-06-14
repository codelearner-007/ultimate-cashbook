import ConfirmSheet from './ConfirmSheet';

export default function DeleteContactSheet({
  visible, onDismiss, onConfirm, contactName, contactType, isLoading, C, Font,
}) {
  const LABELS = { customer: 'Customer', supplier: 'Supplier', mode: 'Payment Mode' };
  const label = LABELS[contactType] ?? 'Customer';
  const bodyText = contactType === 'mode'
    ? `"${contactName}" will be removed. Existing entries will keep their payment mode text.`
    : `"${contactName}" will be removed from your contacts. Linked entries will keep this name for historical reference.`;

  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      icon="trash-2"
      title={`Delete ${label}`}
      message={bodyText}
      confirmLabel={`Delete ${label}`}
      loadingLabel="Deleting…"
      isLoading={isLoading}
      C={C}
      Font={Font}
    />
  );
}
