import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { toast } from '@/client/toast';
import {
  getProOffering,
  purchasePro,
  restorePro,
  revenueCatAvailable,
  revenueCatReady,
} from '@/client/revenuecat';
import { useTheme } from '@/theme/theme-provider';
import { THEME_TOKENS } from '@/theme/tokens';

/**
 * The Klect Pro upgrade screen, as a plain component rather than a route.
 *
 * Two callers need it and only one of them has a navigator: the `/paywall` route (pushed from
 * a cap hit anywhere in the app) and the downgrade-selection gate, which renders *instead of*
 * the navigator and so cannot push anything. Keeping the UI here and making the route a thin
 * wrapper is the only way both get the same screen.
 *
 * Purchases run through `client/revenuecat.ts`, which no-ops when
 * `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` is blank (every build before Stage 2 lands). In that
 * state this renders a visibly stubbed panel — it says so in plain language rather than
 * showing a dead "Subscribe" button or crashing.
 */

/**
 * Friendly labels for RevenueCat's predefined package types, keyed by the enum's string
 * values. A plain record rather than a switch on `PACKAGE_TYPE` so a custom package
 * identifier (or a type added by a future SDK) falls through to the product title instead of
 * failing to compile.
 */
const PLAN_LABELS: Record<string, string> = {
  ANNUAL: 'Yearly',
  SIX_MONTH: 'Every 6 months',
  THREE_MONTH: 'Every 3 months',
  TWO_MONTH: 'Every 2 months',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  LIFETIME: 'Lifetime',
};

/** Friendly plan label; falls back to the App Store product title for custom packages. */
function planLabel(pkg: PurchasesPackage): string {
  return PLAN_LABELS[pkg.packageType] || pkg.product.title || 'Klect Pro';
}

/** What the plan list is currently showing. */
type Phase =
  /** Asking RevenueCat for the current offering. */
  | 'loading'
  /** Real packages to buy. */
  | 'ready'
  /** No API key in this build — the stubbed state. */
  | 'unavailable'
  /** Configured, but the dashboard has no current offering (or it has no packages). */
  | 'empty'
  /** The offerings fetch failed (offline, bad key). Retryable. */
  | 'error';

export type PaywallViewProps = {
  /** One line explaining why the paywall opened, e.g. the cap the user just hit. */
  reason?: string;
  /** Close the paywall. The route wrapper goes back; the downgrade gate returns to selection. */
  onDismiss: () => void;
  /** Label for the dismiss control. */
  dismissLabel?: string;
  /** Called after a purchase or restore that grants `klect_pro`, to refresh server state. */
  onEntitled?: () => void;
  style?: StyleProp<ViewStyle>;
};

const BENEFITS = [
  'Unlimited lists of your own',
  'Unlimited bookmarks inside them',
  'Everything you already saved stays unlocked',
];

export default function PaywallView({
  reason,
  onDismiss,
  dismissLabel = 'Not now',
  onEntitled,
  style,
}: PaywallViewProps) {
  const { theme } = useTheme();
  const t = THEME_TOKENS[theme];

  const [phase, setPhase] = useState<Phase>('loading');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  /** Identifier of the package currently being bought, so only its row shows a spinner. */
  const [buying, setBuying] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    if (!revenueCatReady()) {
      setPhase('unavailable');
      return;
    }
    setPhase('loading');
    try {
      const current = await getProOffering();
      if (!current || current.availablePackages.length === 0) {
        setOffering(null);
        setPhase('empty');
        return;
      }
      setOffering(current);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const busy = buying !== null || restoring;

  async function onBuy(pkg: PurchasesPackage) {
    if (busy) return;
    setBuying(pkg.identifier);
    const outcome = await purchasePro(pkg);
    setBuying(null);

    if (outcome.status === 'cancelled') return;
    if (outcome.status === 'error') {
      toast.error(outcome.message);
      return;
    }
    if (outcome.status === 'purchased-without-entitlement') {
      // The receipt went through but RevenueCat says the product doesn't grant `klect_pro` —
      // a dashboard mapping problem, not something the user can fix by trying again. Say so
      // instead of looping them back onto the buy button.
      toast.error('Purchase went through, but Pro did not unlock. Contact support.');
      return;
    }
    toast.success('Klect Pro is active');
    onEntitled?.();
  }

  async function onRestore() {
    if (busy) return;
    setRestoring(true);
    const outcome = await restorePro();
    setRestoring(false);

    if (outcome.status === 'error') {
      toast.error(outcome.message);
      return;
    }
    if (outcome.status === 'nothing-to-restore') {
      toast.info('No previous Klect Pro purchase found on this Apple ID.');
      return;
    }
    toast.success('Klect Pro restored');
    onEntitled?.();
  }

  return (
    <ScrollView
      style={style}
      className="bg-bg"
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
      <View className="gap-2">
        <Text className="font-serif text-3xl text-ink">Klect Pro</Text>
        {reason ? <Text className="text-base text-muted">{reason}</Text> : null}
      </View>

      <View className="gap-2 rounded-skin border-skin border-border bg-panel p-4">
        {BENEFITS.map((benefit) => (
          <View key={benefit} className="flex-row items-start gap-2">
            <Text style={{ color: t.primary }} className="text-base">
              •
            </Text>
            <Text className="flex-1 text-base text-ink">{benefit}</Text>
          </View>
        ))}
      </View>

      {phase === 'loading' ? (
        <View className="items-center py-6">
          <ActivityIndicator color={t.primary} />
        </View>
      ) : null}

      {phase === 'unavailable' ? (
        <View
          accessibilityRole="summary"
          className="gap-2 rounded-skin border-skin border-border bg-panel p-4">
          <Text className="font-sans-semibold text-base text-ink">
            Upgrades aren&apos;t available in this build
          </Text>
          <Text className="text-sm text-muted">
            In-app purchases are not configured yet, so there is nothing to buy here. Your
            existing lists and bookmarks are unaffected.
          </Text>
        </View>
      ) : null}

      {phase === 'empty' ? (
        <View className="gap-2 rounded-skin border-skin border-border bg-panel p-4">
          <Text className="font-sans-semibold text-base text-ink">No plans available</Text>
          <Text className="text-sm text-muted">
            Klect Pro isn&apos;t on sale right now. Try again in a moment.
          </Text>
        </View>
      ) : null}

      {phase === 'error' ? (
        <View className="gap-3 rounded-skin border-skin border-border bg-panel p-4">
          <Text className="text-sm text-muted">
            Could not load plans. Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={load}
            className="items-center rounded-skin border-skin border-border p-3">
            <Text className="font-sans-medium text-base text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'ready' && offering ? (
        <View className="gap-3">
          {offering.availablePackages.map((pkg) => {
            const pending = buying === pkg.identifier;
            return (
              <Pressable
                key={pkg.identifier}
                accessibilityRole="button"
                accessibilityLabel={`${planLabel(pkg)}, ${pkg.product.priceString}`}
                disabled={busy}
                onPress={() => onBuy(pkg)}
                style={{ backgroundColor: t.primary, opacity: busy && !pending ? 0.5 : 1 }}
                className="flex-row items-center justify-center gap-3 rounded-skin p-4">
                {pending ? <ActivityIndicator color={t.primaryInk} size="small" /> : null}
                <Text
                  style={{ color: t.primaryInk }}
                  className="font-sans-semibold text-base">
                  {planLabel(pkg)} · {pkg.product.priceString}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View className="gap-3">
        {/* Apple requires a reachable restore path on any screen selling a subscription, so
            this stays visible in every phase — including the stub, where it reports that
            purchases aren't configured rather than quietly doing nothing. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          disabled={busy}
          onPress={onRestore}
          style={{ opacity: busy ? 0.5 : 1 }}
          className="flex-row items-center justify-center gap-2 rounded-skin border-skin border-border p-3">
          {restoring ? <ActivityIndicator color={t.primary} size="small" /> : null}
          <Text className="font-sans-medium text-base text-primary">Restore purchases</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          disabled={busy}
          onPress={onDismiss}
          style={{ opacity: busy ? 0.5 : 1 }}
          className="items-center p-2">
          <Text className="text-base text-muted">{dismissLabel}</Text>
        </Pressable>
      </View>

      {revenueCatAvailable() ? (
        <Text className="text-center text-xs text-muted">
          Billed through your Apple ID. Renews automatically until cancelled; manage or cancel
          in Settings.
        </Text>
      ) : null}
    </ScrollView>
  );
}
