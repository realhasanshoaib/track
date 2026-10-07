import { Stack } from 'expo-router';
import { PrimaryStack } from '@/components/primary-stack';

export const unstable_settings = { initialRouteName: 'conversations' };

export default function HomeStackLayout() {
  return (
    <PrimaryStack initialRouteName="conversations">
      <Stack.Screen name="(projects)" options={{ headerShown: false }} />
    </PrimaryStack>
  );
}
