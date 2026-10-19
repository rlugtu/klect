import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Infinity as InfinityIcon, Lock } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getSelectionStatus } from "@/lib/actions/entitlements";
import { CHECKOUT_REFUSAL_MESSAGE } from "@/lib/checkout";
import { PRO_PLANS, isWebBillingConfigured } from "@/lib/revenuecat-web";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelBadge } from "@/components/ui/PixelBadge";

export const metadata: Metadata = {
  title: "Klect Pro",
  robots: { index: false, follow: false },
};

/**
 * The web paywall (Stage 7).
 *
 * Shown when a free user hits a cap (`lib/free-limit.ts` sends them here from
 * the four create paths), or reached directly from the downgrade screen and
 * settings. It states the user's real position against the caps, lists the two
 * plans, and hands off to RevenueCat Web Billing.
 *
 * ## Everything numeric comes from the server
 *
 * `?reason=lists|bookmarks` only chooses which sentence to lead with. The counts
 * and the caps are re-read through `getSelectionStatus`, never taken from the
 * query string, so a hand-edited URL can misphrase the page but cannot misstate
 * what the account actually holds.
 *
 * ## Checkout initiation
 *
 * The buy buttons are plain links to `/api/checkout?plan=…`, which resolves the
 * App User ID from the session and redirects to RevenueCat's hosted checkout.
 * Links rather than a client island on purpose: this page needs no JavaScript to
 * work, and the identifier that decides who gets the entitlement is never
 * something the browser supplies.
 *
 * ## Before Stage 2 lands
 *
 * Web Billing is unconfigured until the Stripe connection is made, so the buy
 * buttons render visibly disabled with an explanation instead of pointing at a
 * dead link. Nothing here throws when the keys are blank.
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; checkout?: string }>;
}) {
  await requireOnboardedUser();
  const [status, params] = await Promise.all([getSelectionStatus(), searchParams]);
  const configured = isWebBillingConfigured();

  // Bounced back from /api/checkout because it could not start one.
  const checkoutError =
    params.checkout === "unconfigured" || params.checkout === "already_pro"
      ? CHECKOUT_REFUSAL_MESSAGE[params.checkout]
      : null;

  const lead = leadLine(params.reason, status.listLimit, status.bookmarkLimit);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-muted hover:text-primary inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-primary text-2xl">Klect Pro</h1>
          {status.isPro && <PixelBadge tone="success">Active</PixelBadge>}
        </div>
        {!status.isPro && <p className="text-muted">{lead}</p>}
      </header>

      {checkoutError && (
        <p className="border-danger text-danger border-2 px-4 py-3 text-sm">
          {checkoutError}
        </p>
      )}

      {status.isPro ? (
        <PixelCard className="flex flex-col gap-3">
          <h2 className="text-sm">You&apos;re already on Pro</h2>
          <p className="text-muted text-sm">
            Unlimited lists and bookmarks, on web and on iOS. Manage or cancel
            the subscription wherever you bought it: the App Store if you
            subscribed on iPhone, or the receipt email from Stripe if you
            subscribed here.
          </p>
          <Link href="/" className="w-fit">
            <PixelButton size="sm">Back to your lists</PixelButton>
          </Link>
        </PixelCard>
      ) : (
        <>
          <PixelCard className="flex flex-col gap-4">
            <h2 className="text-sm">What you get</h2>
            <ul className="flex flex-col gap-2.5">
              <Benefit icon={<InfinityIcon size={14} aria-hidden />}>
                Unlimited lists and bookmarks, instead of {status.listLimit} lists
                and {status.bookmarkLimit} bookmarks.
              </Benefit>
              <Benefit icon={<Lock size={14} aria-hidden />}>
                Everything currently locked unlocks immediately, exactly as you
                left it.
              </Benefit>
              <Benefit icon={<Check size={14} aria-hidden />}>
                One subscription covers web and iOS. Buy it in either place and
                you&apos;re Pro in both.
              </Benefit>
            </ul>
            <p className="text-muted text-xs">
              You currently own {status.activeListCount} list
              {status.activeListCount === 1 ? "" : "s"} and{" "}
              {status.activeBookmarkCount} bookmark
              {status.activeBookmarkCount === 1 ? "" : "s"}. Collaborating on
              someone else&apos;s list has never counted against either cap, and
              never will.
            </p>
          </PixelCard>

          <section className="flex flex-col gap-3">
            <h2 className="font-pixel text-sm">Pick a plan</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRO_PLANS.map((plan) => (
                <PixelCard key={plan.id} className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-pixel text-sm">{plan.label}</span>
                    {plan.note && <PixelBadge tone="accent">{plan.note}</PixelBadge>}
                  </div>
                  <div>
                    <span className="text-primary text-2xl">{plan.price}</span>{" "}
                    <span className="text-muted text-sm">{plan.cadence}</span>
                  </div>
                  {configured ? (
                    <Link href={`/api/checkout?plan=${plan.id}`} className="w-full">
                      <PixelButton className="w-full" size="sm">
                        Get {plan.label}
                      </PixelButton>
                    </Link>
                  ) : (
                    <PixelButton className="w-full" size="sm" disabled>
                      Get {plan.label}
                    </PixelButton>
                  )}
                </PixelCard>
              ))}
            </div>
            <p className="text-muted text-xs">
              {configured
                ? "No free trial. Cancel any time; you keep Pro until the period you paid for ends."
                : "Checkout isn't switched on yet, so these buttons are disabled. Nothing has been charged."}
            </p>
          </section>

          {status.needsSelection && (
            <PixelCard className="flex flex-col gap-3">
              <h2 className="text-sm">Not ready to subscribe?</h2>
              <p className="text-muted text-sm">
                You can stay on free by choosing which {status.listLimit} lists and{" "}
                {status.bookmarkLimit} bookmarks remain active. The rest is locked
                and kept, never deleted.
              </p>
              <Link href="/downgrade" className="w-fit">
                <PixelButton variant="secondary" size="sm">
                  Choose what stays active
                </PixelButton>
              </Link>
            </PixelCard>
          )}
        </>
      )}
    </main>
  );
}

function Benefit({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className="text-primary mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/** Opening sentence, chosen by which cap sent the user here. */
function leadLine(reason: string | undefined, lists: number, bookmarks: number): string {
  if (reason === "lists") {
    return `Free accounts can own ${lists} lists. Pro removes the cap entirely.`;
  }
  if (reason === "bookmarks") {
    return `Free accounts can save ${bookmarks} bookmarks. Pro removes the cap entirely.`;
  }
  return "Unlimited lists and bookmarks, on every device you use Klect on.";
}
