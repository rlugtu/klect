import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient, clearBearerToken } from '@/client/auth';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS, type ThemeName } from '@/theme/tokens';

const THEME_LABELS: Record<ThemeName, string> = {
  JOURNAL_LIGHT: 'Journal · Light',
  JOURNAL_DARK: 'Journal · Dark',
  PIXEL_LIGHT: 'Pixel · Light',
  PIXEL_DARK: 'Pixel · Dark',
  MODERN_LIGHT: 'Modern · Light',
  MODERN_DARK: 'Modern · Dark',
};

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-bg">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text className="text-2xl font-bold text-ink">Settings</Text>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Account</Text>
          <View className="rounded-skin border-skin border-border bg-panel p-3">
            <Text className="text-base text-ink">
              {session?.user?.name ?? 'Signed in'}
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

        <Pressable
          className="items-center rounded-skin border-skin border-border py-3"
          onPress={() => {
            clearBearerToken();
            authClient.signOut();
          }}>
          <Text className="font-semibold text-danger">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
