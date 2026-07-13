import { authClient } from '@/client/auth';
import ProfileView from '@/components/profile-view';

/** The signed-in user's own profile (identity + their public lists). */
export default function ProfileScreen() {
  const { data: session } = authClient.useSession();
  return <ProfileView userId={session?.user?.id} edges={['top', 'left', 'right']} />;
}
