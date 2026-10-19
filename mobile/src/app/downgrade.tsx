import { useRouter } from 'expo-router';

import DowngradeScreen from '@/components/downgrade-screen';

/**
 * The downgrade-selection flow as a pushable modal route: the reclaim path.
 *
 * The root layout's `EntitlementGate` already renders `DowngradeScreen` when
 * `entitlements.status.needsSelection` is true, and that is a *blocking* gate: an account
 * holding more than the free plan allows has nothing coherent to browse until it chooses.
 *
 * This route exists for the opposite case. A free user who locked rows and has since deleted
 * enough to get back under the cap has room to unlock some of them, but `needsSelection` is
 * false by then, so the gate no longer offers the screen and there was previously no way back
 * to it. The home screen's `ReclaimBanner` pushes this route when the server reports
 * `status.canReclaim`. Deliberately a dismissible prompt rather than another gate, because
 * reclaiming is optional and the account is already coherent.
 *
 * Purely a navigation shell, exactly like `app/paywall.tsx` is for `PaywallView`: all of the
 * selection UI lives in `components/downgrade-screen.tsx`, because the gate renders the same
 * screen *without* a navigator and so cannot use a route. `onDone` is the one thing a route
 * has to supply: under the gate a successful commit unmounts the screen, but here it was
 * pushed onto a real stack and has to be popped.
 */
export default function DowngradeRoute() {
  const router = useRouter();
  return <DowngradeScreen onDone={() => router.back()} />;
}
