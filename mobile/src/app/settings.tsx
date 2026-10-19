import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';

import { trpc } from '@/client/api';
import { authClient, clearBearerToken } from '@/client/auth';
import { API_URL } from '@/client/bearer-store';
import { useEntitlements } from '@/client/entitlements';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from '@/client/push';
import { signOutRevenueCat } from '@/client/revenuecat';
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

/**
 * Readable names for the product identifiers the RevenueCat webhook stores on `Entitlement.plan`.
 * A record rather than a switch so an identifier added in the dashboard later falls through to
 * the generic label instead of rendering a raw `klect_pro_*` string at the user.
 *
 * Kept in step with web's Membership section on purpose: the two apps are separate codebases
 * with no shared UI layer, so the display strings are matched by convention, not by import.
 */
const PRO_PLAN_LABELS: Record<string, string> = {
  klect_pro_monthly: 'Klect Pro (Monthly)',
  klect_pro_annual: 'Klect Pro (Annual)',
};

/** Plan name for a pro account. Falls back to the bare product name for anything unmapped. */
function proPlanLabel(plan: string | null): string {
  if (!plan) return 'Klect Pro';
  return PRO_PLAN_LABELS[plan] ?? 'Klect Pro';
}

/**
 * "Renews November 18, 2026" from the ISO expiry, or null when there is nothing honest to say.
 *
 * Null covers two real cases, not just missing data: a comp or promotional grant has no expiry
 * at all (`Entitlement.expiresAt` is nullable for exactly that), and a malformed timestamp
 * should not render "Renews Invalid Date". Callers show a plain "Active" instead.
 */
function renewalLine(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const when = new Date(expiresAt);
  if (Number.isNaN(when.getTime())) return null;
  const date = when.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `Renews ${date}`;
}

/**
 * Apple's own subscription management screen. There is no Klect-specific deep link. This is
 * the standard target every iOS subscription app uses, and it lands on the user's full
 * subscription list rather than only ours.
 *
 * The failure path is an Alert with the manual route rather than a silent swallow, because the
 * scheme genuinely doesn't resolve in the Simulator and on a device without an App Store
 * account, and a dead-feeling button on a billing screen reads as a bug.
 */
function openAppleSubscriptions() {
  Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() => {
    Alert.alert(
      'Could not open Subscriptions',
      'Open the Settings app, tap your name, then Subscriptions to manage your plan.',
    );
  });
}

/**
 * Where this subscription is actually managed, as one row, chosen by the billing path.
 *
 * Branching on `store` instead of showing a single universal "Manage subscription" button is
 * the point: Apple's subscription screen has no record of a Stripe-billed subscriber, so
 * sending them there is a support ticket rather than a cosmetic miss (see the `store` field's
 * own note in `web/src/lib/core/active-selection.ts`). Anything outside the two paths Klect
 * sells through (a comp, a promotional grant, an unmapped RevenueCat store) gets a plain
 * explanatory line and no button, because there is no screen to send them to.
 */
function ManageBillingRow({ store }: { store: string | null }) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];

  if (store === 'app_store') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage subscription, opens your Apple subscription settings"
        onPress={openAppleSubscriptions}
        className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
        <View className="flex-row items-center gap-3">
          <Ionicons name="card-outline" size={22} color={t.primary} />
          <Text className="text-base text-ink">Manage subscription</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={t.muted} />
      </Pressable>
    );
  }

  if (store === 'stripe') {
    // Bought on the web, so it is managed on the web. Same `WebBrowser` + `API_URL` pattern
    // the Privacy Policy and Terms rows already use, pointed at web's own Settings screen.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage subscription on the web, opens in a browser"
        onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/settings`)}
        className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
        <View className="flex-row items-center gap-3">
          <Ionicons name="card-outline" size={22} color={t.primary} />
          <Text className="text-base text-ink">Manage subscription on the web</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={t.muted} />
      </Pressable>
    );
  }

  return (
    <View className="rounded-skin border-skin border-border bg-panel p-3">
      <Text className="text-sm text-muted">
        This plan isn&apos;t billed through the App Store or the web, so there&apos;s nothing
        to manage here. Send feedback if you need it changed.
      </Text>
    </View>
  );
}

/** Pushed stack route, reached via the gear icon on the Profile screen. */
export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const t = THEME_TOKENS[theme];
  // The same shared status the paywall and the downgrade gate read, so Settings can never
  // disagree with them about this account's plan.
  const {
    status: entitlement,
    loading: entitlementLoading,
    error: entitlementError,
  } = useEntitlements();

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

  // Order matters: unregister the device and sign out while the bearer token is still valid
  // (signOut() authenticates with the cached bearer to invalidate the server session and clear the
  // expo cookie store), then wipe local token state last. `finally` guarantees the local wipe even
  // if the network sign-out fails (offline / dead token).
  const signOut = async () => {
    try {
      await unregisterPushNotificationsAsync();
      await authClient.signOut();
    } finally {
      clearBearerToken();
      // Drop the RevenueCat identity too, so the next account on this device starts from a
      // clean app_user_id instead of inheriting this one's purchases view. Best-effort and
      // a no-op when purchases aren't configured.
      signOutRevenueCat();
    }
  };

  // Confirm first — this button sits directly above Delete account, and a stray tap used to end
  // the session outright. Same Alert pattern as the other hard-to-undo actions (list-members.tsx).
  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to reach your bookmarks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
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
          <Text className="text-sm uppercase text-muted">Membership</Text>
          {/* Inert while the first fetch is in flight, same as the notification switches:
              rendering "free plan" before the answer lands would flash the wrong tier at a
              paying subscriber. A failed fetch says so rather than guessing either way. */}
          {entitlementLoading && !entitlement ? (
            <View className="rounded-skin border-skin border-border bg-panel p-3">
              <Text className="text-base text-muted">Checking your plan…</Text>
            </View>
          ) : !entitlement ? (
            <View className="rounded-skin border-skin border-border bg-panel p-3">
              <Text className="text-base text-ink">Plan unavailable</Text>
              <Text className="text-sm text-muted">
                {entitlementError ?? 'Could not check your plan.'}
              </Text>
            </View>
          ) : entitlement.isPro ? (
            <>
              <View className="rounded-skin border-skin border-border bg-panel p-3">
                <Text className="text-base text-ink">{proPlanLabel(entitlement.plan)}</Text>
                <Text className="text-sm text-muted">
                  {renewalLine(entitlement.expiresAt) ?? 'Active'}
                </Text>
              </View>
              <ManageBillingRow store={entitlement.store} />
            </>
          ) : entitlement.status === 'grace' ? (
            // A failed renewal the store is still retrying. `isPro` is false here, so the free
            // caps are already biting, but calling this "the free plan" would be wrong and
            // unactionable. The fix is a payment method, not an upgrade.
            <>
              <View className="rounded-skin border-skin border-border bg-panel p-3">
                <Text className="text-base text-ink">
                  {proPlanLabel(entitlement.plan)} · payment failed
                </Text>
                <Text className="text-sm text-muted">
                  Pro is paused while your last payment is retried. Free limits apply until it
                  clears.
                </Text>
              </View>
              <ManageBillingRow store={entitlement.store} />
            </>
          ) : (
            <>
              <View className="rounded-skin border-skin border-border bg-panel p-3">
                <Text className="text-base text-ink">You&apos;re on the free plan</Text>
                <Text className="text-sm text-muted">
                  {entitlement.activeListCount} of {entitlement.listLimit} lists ·{' '}
                  {entitlement.activeBookmarkCount} of {entitlement.bookmarkLimit} bookmarks
                </Text>
              </View>
              {/* The bare `/paywall` route, which renders the generic pitch when it arrives
                  with no `reason`. No cap was hit here, so there is no reason to carry. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Klect Pro"
                onPress={() => router.push('/paywall')}
                className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
                <View className="flex-row items-center gap-3">
                  <Ionicons name="sparkles-outline" size={22} color={t.primary} />
                  <Text className="text-base text-ink">Upgrade to Klect Pro</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.muted} />
              </Pressable>
            </>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-sm uppercase text-muted">Appearance</Text>
          {(Object.keys(THEME_LABELS) as ThemeName[]).map((name) => {
            const active = name === theme;
            const t = THEME_TOKENS[name];
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={`${THEME_LABELS[name]} theme`}
                accessibilityState={{ selected: active }}
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
              accessibilityRole="button"
              accessibilityLabel="Add Klect to your Share Sheet"
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
              accessibilityRole="button"
              accessibilityLabel="Enable notifications"
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
                {/* Inert until the real preferences land: defaulting to `true` had every
                    switch claim "on", then visibly flip to its stored value. */}
                <Switch
                  accessibilityLabel={`${label} notifications`}
                  value={prefs?.[key] ?? false}
                  disabled={!prefs}
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
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
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
          <Text className="text-sm uppercase text-muted">Safety &amp; privacy</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Blocked users"
            onPress={() => router.push('/blocked')}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons name="ban-outline" size={22} color={t.primary} />
              <Text className="text-base text-ink">Blocked users</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Privacy Policy, opens in a browser"
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/privacy`)}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons name="lock-closed-outline" size={22} color={t.primary} />
              <Text className="text-base text-ink">Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={t.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Terms of Use, opens in a browser"
            onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/terms`)}
            className="flex-row items-center justify-between rounded-skin border-skin border-border bg-panel p-3">
            <View className="flex-row items-center gap-3">
              <Ionicons name="document-text-outline" size={22} color={t.primary} />
              <Text className="text-base text-ink">Terms of Use</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={t.muted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="items-center rounded-skin border-skin border-border py-3"
          onPress={confirmSignOut}>
          <Text className="font-sans-semibold text-danger">Sign out</Text>
        </Pressable>

        <View className="gap-2">
          <Text className="text-sm uppercase text-danger">Danger zone</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete account"
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
