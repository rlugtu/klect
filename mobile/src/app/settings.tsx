import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';

import { trpc } from '@/client/api';
import { authClient, clearBearerToken } from '@/client/auth';
import { API_URL } from '@/client/bearer-store';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from '@/client/push';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS, type ThemeName } from '@/theme/tokens';

type NotifPrefs = Awaited<
  ReturnType<typeof trpc.notifications.getPreferences.query>
>;

/** Push categories, in display order. Keys mirror `NotificationPreference` columns. */
const NOTIF_CATEGORIES: [keyof NotifPrefs, string][] = [
  ['directMessages', 'Direct messages'],
  ['listChat', 'List chat'],
  ['friends', 'Friend requests'],
  ['lists', 'List invites'],
  ['comments', 'Comments'],
  ['polls', 'Polls'],
];

const THEME_LABELS: Record<ThemeName, string> = {
  JOURNAL_LIGHT: 'Journal · Light',
  JOURNAL_DARK: 'Journal · Dark',
  PIXEL_LIGHT: 'Pixel · Light',
  PIXEL_DARK: 'Pixel · Dark',
  MODERN_LIGHT: 'Modern · Light',
  MODERN_DARK: 'Modern · Dark',
};

/** Pushed stack route, reached via the gear icon on the Profile screen. */
export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const t = THEME_TOKENS[theme];

  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  useEffect(() => {
    trpc.notifications.getPreferences.query().then(setPrefs).catch(() => {});
    Notifications.getPermissionsAsync()
      .then((p) => setPermGranted(p.status === 'granted'))
      .catch(() => {});
  }, []);

  // Optimistic toggle; revert if the mutation fails.
  const togglePref = (key: keyof NotifPrefs, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    trpc.notifications.updatePreferences.mutate({ [key]: value }).catch(() => {
      setPrefs((p) => (p ? { ...p, [key]: !value } : p));
    });
  };

  // Request permission, or send the user to iOS Settings if they've denied it before.
  const enableNotifications = async () => {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') {
      setPermGranted(true);
      return;
    }
    if (cur.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      const granted = req.status === 'granted';
      setPermGranted(granted);
      if (granted) registerForPushNotificationsAsync();
    } else {
      Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: headerHeight + 8,
          paddingBottom: 40,
          gap: 24,
        }}>
        <Text className="font-serif text-3xl text-ink">Settings</Text>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Account</Text>
          <View className="rounded-skin border-skin border-border bg-panel p-3">
            <Text className="text-base text-ink">
              {session?.user?.handle ? `@${session.user.handle}` : 'Signed in'}
            </Text>
            <Text className="text-sm text-muted">{session?.user?.email}</Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Appearance</Text>
          {(Object.keys(THEME_LABELS) as ThemeName[]).map((name) => {
            const active = name === theme;
            const t = THEME_TOKENS[name];
            return (
              <Pressable
                key={name}
                onPress={() => setTheme(name)}
                className={`flex-row items-center justify-between rounded-skin border bg-panel p-3 ${
                  active ? 'border-primary' : 'border-border'
                }`}>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row">
                    {[t.bg, t.primary, t.accent, t.ink].map((c, i) => (
                      <View
                        key={i}
                        style={{ backgroundColor: c }}
                        className="h-5 w-5 rounded-skin-sm"
                      />
                    ))}
                  </View>
                  <Text className="text-base text-ink">{THEME_LABELS[name]}</Text>
                </View>
                {active && <Text className="text-primary">✓</Text>}
              </Pressable>
            );
          })}
        </View>

        {Platform.OS === 'ios' && (
          <View className="gap-2">
            <Text className="text-sm uppercase text-muted">Sharing</Text>
            <Pressable
              onPress={() => router.push('/share-help')}
              className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
              <View className="flex-row items-center gap-3">
                <Ionicons name="share-outline" size={22} color={t.primary} />
                <Text className="text-base text-ink">Add Klect to your Share Sheet</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            </Pressable>
          </View>
        )}

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Notifications</Text>
          {permGranted === false ? (
            <Pressable
              onPress={enableNotifications}
              className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
              <View className="flex-row items-center gap-3">
                <Ionicons name="notifications-outline" size={22} color={t.primary} />
                <Text className="text-base text-ink">Enable notifications</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            </Pressable>
          ) : (
            NOTIF_CATEGORIES.map(([key, label]) => (
              <View
                key={key}
                className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
                <Text className="text-base text-ink">{label}</Text>
                <Switch
                  value={prefs?.[key] ?? true}
                  onValueChange={(v) => togglePref(key, v)}
                  trackColor={{ true: t.primary, false: t.border }}
                />
              </View>
            ))
          )}
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Feedback</Text>
          <Pressable
            onPress={() => router.push('/feedback')}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={22}
                color={t.primary}
              />
              <Text className="text-base text-ink">Send feedback</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Privacy</Text>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons name="lock-closed-outline" size={22} color={t.primary} />
              <Text className="text-base text-ink">Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={t.muted} />
          </Pressable>
        </View>

        <Pressable
          className="items-center rounded-skin border-skin border-border py-3"
          onPress={async () => {
            // Unregister the device while the bearer token is still valid, then sign out.
            await unregisterPushNotificationsAsync();
            clearBearerToken();
            authClient.signOut();
          }}>
          <Text className="font-semibold text-danger">Sign out</Text>
        </Pressable>

        <View className="gap-2">
          <Text className="text-sm uppercase text-danger">Danger zone</Text>
          <Pressable
            onPress={() => router.push('/delete-account')}
            style={{ borderColor: t.danger }}
            className="flex-row items-center justify-between rounded-skin border-skin p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons name="trash-outline" size={22} color={t.danger} />
              <Text className="text-base text-danger">Delete account</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.danger} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
