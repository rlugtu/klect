import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { trpc } from '@/client/api';
import { atHandle } from '@/lib/handle';
import FloatingStatusBar from '@/components/floating-status-bar';
import { cardShadow } from '@/theme/shadows';
import { useTabBarScrollHandler } from '@/theme/tab-bar-scroll';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

type Profile = NonNullable<Awaited<ReturnType<typeof trpc.profile.get.query>>>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Renders a user's public profile — identity, stats, and their public lists.
 * Shared by the Profile tab (own) and the pushed users/[handle] route (others).
 * `edges` lets the tab version claim the top safe-area while the pushed version
 * (which has a native header) doesn't.
 */
export default function ProfileView({
  handleOrId,
  edges = ['left', 'right'],
  frostedStatusBar = false,
  contentTopInset,
}: {
  /** A user's @handle or their id — the profile resolves either. */
  handleOrId?: string;
  edges?: ('top' | 'left' | 'right' | 'bottom')[];
  /** Own-profile tab: render content under a frosted status bar (no native header). */
  frostedStatusBar?: boolean;
  /** Pushed stack screen (another user's profile): top padding to clear the frosted
   *  navigation header, so content scrolls under it like the tab screens do. */
  contentTopInset?: number;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState(false);
  const onScroll = useTabBarScrollHandler();

  const load = useCallback(() => {
    if (!handleOrId) return;
    setLoading(true);
    trpc.profile.get
      .query({ handleOrId })
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [handleOrId]);

  useFocusEffect(useCallback(() => load(), [load]));

  async function addFriend() {
    const targetId = profile?.user.id;
    if (!targetId) return;
    setRequested(true);
    try {
      await trpc.friends.requestByUser.mutate({ userId: targetId });
    } catch {
      setRequested(false);
    }
  }

  const name = atHandle(profile?.user.handle);
  const memberSince = profile
    ? new Date(profile.user.createdAt).getFullYear()
    : '';

  return (
    <SafeAreaView style={{ flex: 1 }} edges={edges} className="bg-bg">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          padding: 16,
          paddingTop:
            contentTopInset ?? (frostedStatusBar ? insets.top + 16 : 16),
          paddingBottom: 120,
          gap: 20,
        }}>
        {loading && !profile && (
          <Text className="font-sans text-muted">Loading…</Text>
        )}
        {error && <Text className="font-sans text-danger">{error}</Text>}

        {profile && (
          <>
            {/* Identity */}
            <View className="items-center gap-2">
              <View
                style={cardShadow}
                className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-skin border-border bg-panel">
                {profile.user.image ? (
                  <Image
                    source={{ uri: profile.user.image }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 44 }}>
                    {profile.user.icon ?? '🙂'}
                  </Text>
                )}
              </View>
              <Text className="font-serif text-2xl text-ink">{name}</Text>
              <Text className="font-sans text-xs text-muted">
                Member since {memberSince}
              </Text>
            </View>

            {/* Stats */}
            <View className="flex-row justify-center gap-10">
              <Stat value={profile.publicLists.length} label="Public lists" />
              <Stat value={profile.friendCount} label="Friends" />
            </View>

            {/* Friend action */}
            {profile.friendship === 'none' && (
              <Pressable
                disabled={requested}
                onPress={addFriend}
                className="items-center rounded-skin bg-primary py-3">
                <Text className="font-sans-semibold text-primary-ink">
                  {requested ? 'Request sent' : 'Add friend'}
                </Text>
              </Pressable>
            )}
            {profile.friendship === 'pending' && (
              <View className="items-center rounded-skin border-skin border-border py-3">
                <Text className="font-sans text-muted">Request pending</Text>
              </View>
            )}
            {profile.friendship === 'friends' && (
              <View className="items-center rounded-skin border-skin border-border py-3">
                <Text className="font-sans text-primary">✓ Friends</Text>
              </View>
            )}

            {/* Public lists */}
            <View className="gap-3">
              <Text className="font-sans-medium text-sm uppercase text-muted">
                Public lists
              </Text>
              {profile.publicLists.length === 0 ? (
                <Text className="font-serif-italic text-muted">
                  {profile.friendship === 'self'
                    ? 'No public lists yet — flip a list to public to show it here.'
                    : 'No public lists yet.'}
                </Text>
              ) : (
                profile.publicLists.map((list) => (
                  <Pressable
                    key={list.id}
                    onPress={() =>
                      router.push({
                        pathname: '/lists/[id]',
                        params: { id: list.id, name: list.name },
                      })
                    }
                    style={cardShadow}
                    className="rounded-skin border-skin border-border bg-panel p-4">
                    <Text className="font-serif text-xl text-ink">
                      {list.icon} {list.name}
                    </Text>
                    <Text className="mt-0.5 font-sans text-sm text-muted">
                      {plural(list._count.bookmarks, 'bookmark')}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>
      {frostedStatusBar && profile?.friendship === 'self' && (
        <Pressable
          accessibilityLabel="Settings"
          hitSlop={8}
          onPress={() => router.push('/settings')}
          style={{
            position: 'absolute',
            right: 16,
            top: insets.top + 12,
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons
            name="settings-outline"
            size={22}
            color={THEME_TOKENS[theme].primary}
          />
        </Pressable>
      )}
      {/* Both the own-profile tab and the pushed friend profile (transparent header)
          take their gradual blur from the status component, home-style. */}
      <FloatingStatusBar />
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="font-sans-semibold text-xl text-primary">{value}</Text>
      <Text className="font-sans text-xs uppercase text-muted">{label}</Text>
    </View>
  );
}
