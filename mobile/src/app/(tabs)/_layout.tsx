import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import FloatingTabBar from '@/components/floating-tab-bar';
import { TabBarScrollProvider } from '@/theme/tab-bar-scroll';

export default function AppTabs() {
  return (
    <TabBarScrollProvider>
      {/*
        Tab order is deliberate: Lists (index) sits dead-center of the five tabs,
        with Profile before Settings. React Navigation renders tabs in the order
        these <Tabs.Screen> are declared, so the JSX order IS the bar order.
      */}
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarShowLabel: false }}>
        <Tabs.Screen
          name="nearby"
          options={{
            title: 'Nearby',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="location-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Friends',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="people-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Lists',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="list" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="person-circle-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="settings-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </TabBarScrollProvider>
  );
}
