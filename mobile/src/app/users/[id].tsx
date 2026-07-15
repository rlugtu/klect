import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';

import ProfileView from '@/components/profile-view';

/** Another user's public profile, pushed from a friend row or list owner. */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();
  const headerHeight = useHeaderHeight();
  return (
    <>
      <Stack.Screen options={{ headerTitle: '' }} />
      <ProfileView userId={id} contentTopInset={headerHeight + 8} />
    </>
  );
}
