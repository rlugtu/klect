import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import { trpc } from '@/client/api';

/**
 * Device push notifications (iOS lockscreen alerts + app-icon badge). Registers the
 * device's Expo push token with the backend (`notifications.registerDevice`) so the
 * server can push new-message / friend-request / list / comment / poll alerts. The badge
 * count is server-computed and delivered in each push; {@link setBadgeCount} keeps it in
 * sync from the client's attention counts too (see `client/notifications.tsx`).
 *
 * Backend delivery lives once in web (`web/src/lib/core/push.ts`), fired alongside the
 * existing realtime pings; this module is UI-side registration + tap routing only.
 */

const PUSH_TOKEN_KEY = 'klect_push_token';

/**
 * Foreground behaviour: still show the banner + play sound + set the badge even while the
 * app is open (SDK 54 keys — `shouldShowBanner`/`shouldShowList` replace `shouldShowAlert`).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** The EAS project id, needed to mint an Expo push token. */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  );
}

/**
 * Request permission (if needed) and register this device's Expo push token with the
 * backend. No-ops on simulators (no APNs) and when permission is denied. Idempotent:
 * skips the network call when the token hasn't changed since last launch. Safe to call on
 * every authenticated app start.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    // Android needs a channel for notifications to appear (harmless no-op on iOS).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = getProjectId();
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    // Avoid a redundant register call when the token is unchanged across launches.
    const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null);
    if (stored === token) return;

    await trpc.notifications.registerDevice.mutate({
      token,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
    });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token).catch(() => {});
  } catch {
    // Best-effort — push is an enhancement; failures never block app startup.
  }
}

/**
 * Unregister this device server-side and forget the stored token. Call on sign-out so a
 * signed-out device stops receiving the previous user's notifications.
 */
export async function unregisterPushNotificationsAsync(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null);
    if (stored) {
      await trpc.notifications.unregisterDevice.mutate({ token: stored }).catch(() => {});
    }
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => {});
    await Notifications.setBadgeCountAsync(0).catch(() => {});
  } catch {
    // Best-effort.
  }
}

/** Set the iOS app-icon badge (clamped at 0). */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Best-effort.
  }
}
