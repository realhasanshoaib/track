import { TopTabs } from 'expo-router/js-top-tabs';
import { useReducedMotion } from 'react-native-reanimated';

import { PrimaryNavigation } from '@/components/primary-navigation';
import { PrimaryNavigationVisibilityProvider } from '@/contexts/primary-navigation-visibility-context';

export default function PrimaryTabsLayout() {
  const reducedMotion = useReducedMotion();

  return (
    <PrimaryNavigationVisibilityProvider>
      <TopTabs
        backBehavior="history"
        tabBarPosition="bottom"
        tabBar={(props: Parameters<typeof PrimaryNavigation>[0]) => <PrimaryNavigation {...props} />}
        screenOptions={{
          animationEnabled: !reducedMotion,
          lazy: true,
          swipeEnabled: true,
        }}
      >
        <TopTabs.Screen name="(home)" options={{ title: 'Chats' }} />
        <TopTabs.Screen name="(tasks)" options={{ title: 'My Tasks' }} />
        <TopTabs.Screen name="(inbox)" options={{ title: 'Inbox' }} />
        <TopTabs.Screen name="(profile)" options={{ title: 'Profile' }} />
      </TopTabs>
    </PrimaryNavigationVisibilityProvider>
  );
}
