import { StyleSheet } from 'react-native';
import ConfirmSheet from './ConfirmSheet';

export default function LogoutSheet({ visible, onDismiss, onConfirm, isLoading, C, Font }) {
  return (
    <ConfirmSheet
      visible={visible}
      onDismiss={onDismiss}
      onConfirm={onConfirm}
      icon="log-out"
      title="Logout"
      subtitle="You'll need to sign in again"
      message="Are you sure you want to logout? Your data is safely stored and will be available when you sign back in."
      bodyStyle={s.body}
      confirmLabel="Logout"
      loadingLabel="Logging out…"
      isLoading={isLoading}
      cancelDisabled={isLoading}
      C={C}
      Font={Font}
    />
  );
}

const s = StyleSheet.create({
  body: { marginBottom: 22 },
});
