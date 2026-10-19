import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { coerceTheme } from "@/lib/theme";
import { updateProfile } from "@/lib/actions/profile";
import { getBlockedUsers } from "@/lib/blocks";
import { getSelectionStatus } from "@/lib/actions/entitlements";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { BlockedUsersSection } from "@/components/settings/BlockedUsersSection";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  // One read for both: `getSelectionStatus` is the same shared entitlement read the
  // paywall and the downgrade screen use, so the membership section below can never
  // disagree with either about what this account is.
  const [blocked, status] = await Promise.all([
    getBlockedUsers(user.id),
    getSelectionStatus(),
  ]);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12 flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-primary">Settings</h1>
        <Link href="/">
          <PixelButton variant="ghost" size="sm">
            ← Home
          </PixelButton>
        </Link>
      </header>

      <PixelCard>
        <h2 className="text-sm mb-5">Profile</h2>
        <ProfileForm
          action={updateProfile}
          submitLabel="Save changes"
          defaults={{
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            handle: user.handle ?? null,
            icon: user.icon ?? null,
            theme: coerceTheme(user.theme),
          }}
        />
      </PixelCard>

      <PixelCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm">Membership</h2>
          <PixelBadge tone={status.isPro ? "success" : "default"}>
            {status.isPro ? "Pro" : "Free"}
          </PixelBadge>
        </div>
        {status.isPro ? (
          <>
            <p className="text-ink mb-1">{planLabel(status.plan)}</p>
            <p className="text-muted mb-4 text-sm">
              {periodLine(status.expiresAt, status.store)}
            </p>
            <p className="text-muted text-sm">{manageCopy(status.store)}</p>
          </>
        ) : (
          <>
            <p className="text-muted mb-1">
              {freeLeadLine(status.status, status.expiresAt)}
            </p>
            <p className="text-muted mb-4 text-sm">
              Using {status.activeListCount} of {status.listLimit} lists and{" "}
              {status.activeBookmarkCount} of {status.bookmarkLimit} bookmarks. Lists
              you collaborate on never count.
            </p>
            <Link href="/upgrade">
              <PixelButton variant="secondary" size="sm">
                Upgrade to Pro →
              </PixelButton>
            </Link>
          </>
        )}
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">iOS share sheet</h2>
        <p className="text-muted mb-4 text-sm">
          Save links to Klect from any app on your iPhone — no copy-pasting.
        </p>
        <Link href="/settings/share-extension">
          <PixelButton variant="secondary" size="sm">
            Learn how →
          </PixelButton>
        </Link>
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">Feedback</h2>
        <p className="text-muted mb-4 text-sm">
          Found a bug or have an idea? We&apos;d love to hear it.
        </p>
        <Link href="/settings/feedback">
          <PixelButton variant="secondary" size="sm">
            Send feedback →
          </PixelButton>
        </Link>
      </PixelCard>

      <BlockedUsersSection blocked={blocked} />

      <PixelCard>
        <h2 className="text-sm mb-4">Privacy &amp; terms</h2>
        <p className="text-muted mb-4 text-sm">
          Read how Klect collects, uses, and protects your data, and the rules for using Klect.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/privacy">
            <PixelButton variant="secondary" size="sm">
              Privacy Policy →
            </PixelButton>
          </Link>
          <Link href="/terms">
            <PixelButton variant="secondary" size="sm">
              Terms of Use →
            </PixelButton>
          </Link>
        </div>
      </PixelCard>

      <PixelCard>
        <h2 className="text-sm mb-4">Account</h2>
        <p className="text-muted mb-1">
          Signed in as <span className="text-ink">@{user.handle}</span>
        </p>
        <p className="text-muted mb-4 text-sm">{user.email}</p>
        <SignOutButton />
      </PixelCard>

      <DeleteAccountSection handle={user.handle ?? ""} />
    </main>
  );
}

/**
 * Dates in the membership section.
 *
 * Locale and time zone are both pinned rather than left to the host. This renders on
 * the server, so an unpinned formatter would read the deploy machine's environment:
 * the same entitlement row would print one date in UTC on Vercel and the day before
 * on a laptop in a negative offset. Pinning to UTC costs a renewal that falls near
 * local midnight being named a day off for some users, which is a fine trade for a
 * renewal date, and much better than a date that changes depending on where the page
 * was rendered. The user's own time zone is not knowable here, only in the browser.
 */
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Prefix every Klect Pro product identifier shares. */
const PLAN_PREFIX = "klect_pro";

/**
 * "klect_pro_monthly" into "Klect Pro (Monthly)".
 *
 * Derived from the identifier instead of looked up in a table of the two plans that
 * exist today, so a SKU added later (a quarterly tier, a lifetime grant) still
 * renders as something a human reads rather than leaking a raw product id into the
 * UI. Anything that is not a Klect Pro identifier falls back to the plain product
 * name, because a subscriber seeing "Klect Pro" is correct even when the cadence is
 * unknown.
 */
function planLabel(plan: string | null): string {
  if (!plan || !plan.startsWith(PLAN_PREFIX)) return "Klect Pro";
  const cadence = plan.slice(PLAN_PREFIX.length).replace(/_/g, " ").trim();
  if (!cadence) return "Klect Pro";
  return `Klect Pro (${cadence.charAt(0).toUpperCase()}${cadence.slice(1)})`;
}

/**
 * How to name a billing path to a user, or null for any store Klect does not
 * actually sell through. Null rather than the raw value on purpose: the entitlement
 * `store` column can hold "unknown" or a passed-through RevenueCat store (see
 * SelectionStatus.store), and a line reading "billed via unknown" is worse than one
 * that simply omits the clause.
 */
function storeLabel(store: string | null): string | null {
  if (store === "stripe") return "Stripe";
  if (store === "app_store") return "the App Store";
  if (store === "play_store") return "Google Play";
  return null;
}

/**
 * The line under the plan name: when the current period ends, and who charges for
 * it.
 *
 * A null `expiresAt` is not a missing value to paper over. It means a lifetime or
 * promotional grant, which `isEntitlementActive` keeps active indefinitely, so it
 * gets its own sentence rather than a blank date or a misleading "expired".
 */
function periodLine(expiresAt: Date | null, store: string | null): string {
  const when = expiresAt
    ? `Renews ${DAY_FORMAT.format(expiresAt)}`
    : "No renewal date on file, so it does not expire";
  const label = storeLabel(store);
  return label ? `${when}, billed via ${label}.` : `${when}.`;
}

/**
 * Where to cancel or change the subscription.
 *
 * Web settings deliberately does not link a Stripe billing portal. Creating an
 * authenticated portal session is a server-side Stripe integration Klect does not
 * have, and a link that 404s or demands a login nobody set up is worse than a
 * sentence that tells the truth. This repeats what /upgrade already tells a pro user
 * ("the receipt email from Stripe if you subscribed here") so the two screens cannot
 * send the same person to two different places.
 *
 * The App Store and Google Play cases are here even though neither purchase can have
 * started on web: one subscription covers web and iOS, so somebody who subscribed on
 * their iPhone and then opened settings in a browser needs the iOS answer, not the
 * Stripe one.
 */
function manageCopy(store: string | null): string {
  if (store === "app_store") {
    return "Manage or cancel in iOS Settings → your Apple Account → Subscriptions.";
  }
  if (store === "play_store") {
    return "Manage or cancel in Google Play under Payments & subscriptions.";
  }
  if (store === "stripe") {
    return "Manage or cancel any time from the receipt email Stripe sent you.";
  }
  return "Manage or cancel wherever you bought the subscription.";
}

/**
 * Lead sentence for an account that is not currently pro.
 *
 * "You're on the free plan" is true in all three cases but unhelpful in two of them,
 * which is the whole reason the status carries `status` next to `isPro`. A "grace"
 * row is a renewal the store is still retrying, and telling that user nothing but
 * "free plan" hides the fact that their card bounced. A freshly expired row is worth
 * dating so the drop in caps has a visible cause.
 */
function freeLeadLine(lifecycle: string | null, expiresAt: Date | null): string {
  if (lifecycle === "grace") {
    return "Your last Klect Pro payment did not go through, so you are on the free plan while the store retries it.";
  }
  if (lifecycle === "expired" && expiresAt) {
    return `Your Klect Pro subscription ended ${DAY_FORMAT.format(expiresAt)}, so you are on the free plan.`;
  }
  return "You are on the free plan.";
}
