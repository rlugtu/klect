import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEntitlements } from '@/client/entitlements';
import PaywallView from '@/components/paywall-view';

/**
 * The Klect Pro upgrade screen as a pushable modal route.
 *
 * Opened by the cap-hit trigger sites (`lists/new`, `bookmarks/new`) via
 * `paywallRouteFor(...)` in `client/free-limit.ts`, which carries the explanation sentence in
 * a `reason` param. Also reachable as a bare deep link (`klect:///paywall`) — that is the
 * target of the Share Extension's "Open Klect to upgrade" nudge, since the extension runs in
 * a separate process with no navigator and cannot host a paywall itself. With no `reason`,
 * the screen shows the generic pitch.
 *
 * All of the actual purchase UI lives in `components/paywall-view.tsx`, because the
 * downgrade-selection gate renders the same screen *without* a navigator and so can't use a
 * route. This file is only the navigation shell.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { refreshAfterPurchase } = useEntitlements();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-bg">
      <PaywallView
        reason={reason}
        onDismiss={() => router.back()}
        onEntitled={() => {
          // StoreKit already says the user is pro; our own Entitlement row is written by the
          // RevenueCat webhook, so poll until the server agrees. Closing immediately is right
          // either way — the purchase is done and nothing here depends on the server answer.
          refreshAfterPurchase();
          router.back();
        }}
      />
    </SafeAreaView>
  );
}
