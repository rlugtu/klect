/**
 * RevenueCat Web Billing: the plan catalog and the hosted-checkout URL builder.
 *
 * Stage 7 of IMPLEMENTATION_PLAN.md. This is the *initiation* half of the web
 * paywall and nothing else: deciding whether a user is pro stays a local read
 * (`core/entitlements.ts`), and writing the entitlement row stays the Stage 5
 * webhook's job (`core/revenuecat.ts`). Keeping purchase initiation behind a
 * single builder is the "swappable purchase initiation" constraint in the plan —
 * swapping the hosted link for the in-page `@revenuecat/purchases-js` SDK later
 * touches this file and nothing in `core/` or the schema.
 *
 * ## Why a hosted purchase link rather than the in-page SDK
 *
 * RevenueCat's Web Billing hosted link (`https://pay.rev.cat/<token>/<appUserId>`)
 * takes the whole checkout off our origin: no client SDK in the bundle, no card
 * fields we have to own, and the App User ID rides in the URL path where it is
 * visible and verifiable rather than buried in SDK state. The trade is that the
 * prices below are copied from the dashboard instead of fetched from it, so they
 * have to be kept in step by hand — see {@link PRO_PLANS}.
 *
 * ## Identifying the user (this is load-bearing for Stage 5)
 *
 * Every checkout URL carries Klect's own `User.id` as the App User ID. The
 * webhook resolves `event.app_user_id` directly as a `User.id`, so a purchase
 * started without one (or with a RevenueCat-minted anonymous id) lands on an
 * unresolvable user and never grants pro. {@link buildWebCheckoutUrl} is the only
 * way this app starts a checkout, and it cannot be called without an id.
 *
 * ## Degrading when unconfigured
 *
 * Both public values are blank until Stage 2's Stripe / Web Billing connection
 * lands. `isWebBillingConfigured()` is false until then and every caller renders
 * a visibly disabled state instead of a dead link, matching how Mapbox and
 * EmailJS no-op when their keys are unset.
 */

/** The RevenueCat entitlement identifier that grants pro. Exact string, both platforms. */
export const PRO_ENTITLEMENT_ID = "klect_pro";

/** The two things a user can buy. Mirrors the products configured in Stage 2. */
export type PlanId = "monthly" | "annual";

export type ProPlan = {
  id: PlanId;
  /** Button/heading copy. */
  label: string;
  /** Display price. Copied from the RevenueCat dashboard, not fetched (see above). */
  price: string;
  /** Billing cadence, shown next to the price. */
  cadence: string;
  /**
   * RevenueCat package identifier, passed as `package_id` so the hosted link
   * skips its plan picker and opens straight on the chosen plan. These are
   * RevenueCat's standard identifiers for a monthly / annual package.
   */
  packageId: string;
  /** Optional nudge line, e.g. the annual saving. */
  note?: string;
};

/**
 * $1.99/month or $19.99/year, no free trial — the pricing decided in the vault's
 * Klect Monetization Plan and configured in RevenueCat in Stage 2. Annual works
 * out at 16% off twelve months of monthly.
 */
export const PRO_PLANS: readonly ProPlan[] = [
  {
    id: "annual",
    label: "Annual",
    price: "$19.99",
    cadence: "per year",
    packageId: "$rc_annual",
    note: "Save 16% vs monthly",
  },
  {
    id: "monthly",
    label: "Monthly",
    price: "$1.99",
    cadence: "per month",
    packageId: "$rc_monthly",
  },
];

/** Narrow an untrusted string (a query param) to a {@link PlanId}. */
export function isPlanId(value: unknown): value is PlanId {
  return value === "monthly" || value === "annual";
}

/** The plan a {@link PlanId} names, or the default (annual) for anything else. */
export function planFor(id: unknown): ProPlan {
  return PRO_PLANS.find((p) => p.id === id) ?? PRO_PLANS[0];
}

/**
 * Public Web Billing key. Client-exposed on purpose (`NEXT_PUBLIC_`): it is the
 * publishable half of the RevenueCat key pair, and it is what
 * `@revenuecat/purchases-js` would be configured with if in-page checkout ever
 * replaces the hosted link.
 */
const PUBLIC_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_API_KEY ?? "";

/**
 * The hosted purchase link from the RevenueCat dashboard. Accepts either the
 * full URL (`https://pay.rev.cat/abc123`) or just the token (`abc123`).
 */
const PURCHASE_LINK = process.env.NEXT_PUBLIC_REVENUECAT_WEB_PURCHASE_LINK ?? "";

/** Where a bare token is hosted, when the env var holds a token rather than a URL. */
const PURCHASE_LINK_ORIGIN = "https://pay.rev.cat";

/**
 * Whether web checkout can actually run.
 *
 * Deliberately requires *both* public values. They come from the same dashboard
 * screen in the same sitting, so exactly one of them being set means a copy-paste
 * was left half-finished — and a paywall that looks live while pointing at a
 * link nobody configured is worse than one that plainly says "not available yet".
 */
export function isWebBillingConfigured(): boolean {
  return PUBLIC_API_KEY.trim() !== "" && PURCHASE_LINK.trim() !== "";
}

/**
 * The hosted RevenueCat checkout URL for this user and plan, or `null` when Web
 * Billing is not configured (or the configured link is not a usable URL).
 * Returning null rather than throwing is what lets every caller show the stubbed
 * state instead of a 500.
 *
 * `appUserId` must be Klect's `User.id`. See the file header.
 */
export function buildWebCheckoutUrl(appUserId: string, plan: PlanId): string | null {
  if (!isWebBillingConfigured()) return null;
  if (!appUserId) return null;

  const raw = PURCHASE_LINK.trim().replace(/\/+$/, "");
  const base = /^https?:\/\//i.test(raw) ? raw : `${PURCHASE_LINK_ORIGIN}/${raw}`;

  try {
    // The App User ID goes in the path, URL-encoded, exactly as RevenueCat's
    // Web Purchase Link format requires for an identified customer.
    const url = new URL(`${base}/${encodeURIComponent(appUserId)}`);
    url.searchParams.set("package_id", planFor(plan).packageId);
    return url.toString();
  } catch {
    // A malformed link in the env var is a configuration mistake, not a reason
    // to take the upgrade page down.
    console.error("[revenuecat] NEXT_PUBLIC_REVENUECAT_WEB_PURCHASE_LINK is not a usable URL.");
    return null;
  }
}
