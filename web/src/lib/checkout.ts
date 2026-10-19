import "server-only";
import { requireUser } from "@/lib/session";
import { isPro } from "@/lib/core/entitlements";
import {
  buildWebCheckoutUrl,
  isWebBillingConfigured,
  type PlanId,
} from "@/lib/revenuecat-web";

/**
 * Starting a web checkout for the signed-in user.
 *
 * Stage 7 of IMPLEMENTATION_PLAN.md. Two things call this and they must behave
 * identically, which is the only reason it is its own module rather than inline
 * in either of them:
 *
 *  - `app/api/checkout/route.ts`, the no-JavaScript path. The upgrade page's
 *    buttons are plain links to it, so a click works before hydration.
 *  - `startWebCheckout` in `lib/actions/entitlements.ts`, the same thing for a
 *    client island that wants the URL without a full navigation.
 *
 * ## The App User ID is resolved here, never sent by the client
 *
 * The checkout URL carries Klect's own `User.id` as RevenueCat's App User ID
 * (the Web Billing equivalent of `Purchases.logIn(user.id)` on iOS). It comes
 * from the server session via {@link requireUser} and is never read off a query
 * param or a request body, so a caller cannot start a checkout that credits
 * somebody else's account. The Stage 5 webhook resolves `event.app_user_id`
 * directly as a `User.id`, so this is the join between a Stripe payment and a
 * Klect account. Get it wrong and the purchase never grants pro.
 *
 * ## Failing soft
 *
 * Returns a reason instead of throwing. Web Billing is unconfigured until the
 * Stage 2 Stripe connection lands, and an unconfigured paywall should render a
 * plainly disabled state, not a 500.
 */
export type CheckoutSession =
  | { ok: true; url: string; appUserId: string }
  | { ok: false; reason: CheckoutRefusal; message: string };

/** Why a checkout could not be started. Narrow on this, not on the message. */
export type CheckoutRefusal = "unconfigured" | "already_pro";

/** Human-readable copy per refusal, so every caller says the same thing. */
export const CHECKOUT_REFUSAL_MESSAGE: Record<CheckoutRefusal, string> = {
  unconfigured: "Checkout isn't available yet. Please try again soon.",
  already_pro: "You're already on Klect Pro.",
};

/**
 * The hosted RevenueCat checkout URL for the signed-in user, or a reason it
 * cannot be started. Redirects to /login (via {@link requireUser}) when there is
 * no session, because an anonymous checkout has no account to credit.
 */
export async function createWebCheckoutSession(
  plan: PlanId,
): Promise<CheckoutSession> {
  const user = await requireUser();

  // A second subscription would be a second charge for an entitlement they
  // already hold, so refuse before sending them anywhere near Stripe.
  if (await isPro(user.id)) {
    return {
      ok: false,
      reason: "already_pro",
      message: CHECKOUT_REFUSAL_MESSAGE.already_pro,
    };
  }

  if (!isWebBillingConfigured()) {
    return {
      ok: false,
      reason: "unconfigured",
      message: CHECKOUT_REFUSAL_MESSAGE.unconfigured,
    };
  }

  const url = buildWebCheckoutUrl(user.id, plan);
  if (!url) {
    // Configured but unusable (a malformed purchase link). Same user-facing
    // outcome; `buildWebCheckoutUrl` has already logged the detail.
    return {
      ok: false,
      reason: "unconfigured",
      message: CHECKOUT_REFUSAL_MESSAGE.unconfigured,
    };
  }

  return { ok: true, url, appUserId: user.id };
}
