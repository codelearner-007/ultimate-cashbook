import { useRouter } from 'expo-router';
import NotificationInbox from '../components/notifications/NotificationInbox';

export default function AdminNotificationsInboxScreen() {
  const router = useRouter();
  return (
    <NotificationInbox
      emptySubtitle="Notifications sent to you will appear here."
      fabLabel="Send Notification"
      onFab={() => router.push('/(app)/admin-send-notification')}
      applyTopInset={true}
    />
  );
}
