import { Stack } from 'expo-router';
import { useTheme } from '../../../../src/hooks/useTheme';
export default function AdminBooksLayout() {
  const { C } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.background } }} />;
}
