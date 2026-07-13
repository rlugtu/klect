import { Stack, useLocalSearchParams } from 'expo-router';

import ProfileView from '@/components/profile-view';

/** Another user's public profile, pushed from a friend row or list owner. */
export default function UserProfileScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Profile' }} />
      <ProfileView userId={id} />
    </>
  );
}
