import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import SplashScreen from '../src/screens/SplashScreen';

export default function Index() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  function handleFinish() {
    if (!user) {
      router.replace('/(auth)/login');
    } else if (user.role === 'superadmin') {
      router.replace('/(app)/dashboard/users');
    } else {
      router.replace('/(app)/books');
    }
  }

  return <SplashScreen onFinish={handleFinish} />;
}
