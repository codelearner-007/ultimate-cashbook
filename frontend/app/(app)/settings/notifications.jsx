import { useAuthStore } from '../../../src/store/authStore';
import AdminNotificationsInboxScreen from '../../../src/screens/AdminNotificationsInboxScreen';
import NotificationsScreen from '../../../src/screens/NotificationsScreen';

export default function NotificationsRoute() {
  const user = useAuthStore(s => s.user);
  return user?.role === 'superadmin'
    ? <AdminNotificationsInboxScreen />
    : <NotificationsScreen />;
}
