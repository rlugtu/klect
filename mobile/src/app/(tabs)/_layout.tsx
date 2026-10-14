import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

import FloatingTabBar from '@/components/floating-tab-bar';
import { AttentionProvider } from '@/client/notifications';
import { TabBarScrollProvider } from '@/theme/tab-bar-scroll';

// A bottom-positioned material-top-tabs navigator gives the tabs real horizontal
// swipe (react-native-pager-view under the hood); the custom FloatingTabBar reads the
// pager's swipe position to crossfade each icon from outline to fill. Wired into
// expo-router's file-based routes via withLayoutContext.
const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

export default function AppTabs() {
  return (
    <TabBarScrollProvider>
      {/* Provides the unread-DM + friend-request counts that drive the Friends tab badge. */}
      <AttentionProvider>
        {/*
          Swipe order (left→right): Nearby, Klect (index), Friends, Profile. The bar
          renders them Nearby · [Create] · Klect · Friends · Profile — "Create" is an
          action button injected by FloatingTabBar, NOT a swipe page, so it pushes the
          standalone new-bookmark modal instead of participating in the pager.
        */}
        <MaterialTopTabs
          tabBarPosition="bottom"
          tabBar={(props) => <FloatingTabBar {...props} />}
          screenOptions={{ swipeEnabled: true, lazy: true }}>
          <MaterialTopTabs.Screen name="nearby" options={{ title: 'Nearby' }} />
          {/* "Klect" (not "Lists") so the tab's name matches the heading the screen
              itself shows, the way Nearby/Friends/Profile already do. */}
          <MaterialTopTabs.Screen name="index" options={{ title: 'Klect' }} />
          <MaterialTopTabs.Screen name="friends" options={{ title: 'Friends' }} />
          <MaterialTopTabs.Screen name="profile" options={{ title: 'Profile' }} />
        </MaterialTopTabs>
      </AttentionProvider>
    </TabBarScrollProvider>
  );
}
