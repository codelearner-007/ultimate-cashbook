import NotificationInbox from '../components/notifications/NotificationInbox';

export default function AdminNotificationsInboxScreen() {
  return (
    <NotificationInbox
      emptySubtitle="Notifications sent to you will appear here."
      applyTopInset={true}
    />
  );
}
