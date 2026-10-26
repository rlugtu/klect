import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Loader } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getSelectionStatus } from "@/lib/actions/entitlements";
import { getRemoteProStatus } from "@/lib/revenuecat-remote";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { RefreshButton } from "@/components/entitlements/RefreshButton";

export const metadata: Metadata = {
  title: "Welcome to Klect Pro",
  robots: { index: false, follow: false },
};

/** Always fresh: the whole point is the state a second ago, not a cached one. */
export const dynamic = "force-dynamic";

/**
 * Where RevenueCat's hosted checkout returns a buyer (set as the success /
 * redirect URL in the Web Billing dashboard, Stage 2).
 *
 * The entitlement row is written by the webhook, not by this page, and the
 * webhook can take a few seconds to land. Without something here, a user who
 * just paid would see "you're on the free plan", which reads as a failed
 * payment. So: local state first (the source of truth for every cap check), and
 * only if that is still free, one cosmetic read-only question to RevenueCat
 * through `lib/revenuecat-remote.ts` to distinguish "paid, still syncing" from
 * "nothing bought".
 *
 * That remote call never gates anything. It cannot grant pro, it is never on a
 * write path, and every failure mode collapses to "unknown", which renders the
 * same patient "processing" copy.
 */
export default async function UpgradeSuccessPage() {
  const user = await requireOnboardedUser();
  const status = await getSelectionStatus();

  // Local entitlement already synced: the webhook beat the redirect.
  if (status.isPro) return <Done />;

  const remote = await getRemoteProStatus(user.id);
  return remote === "active" ? <Syncing /> : <Pending />;
}

function Shell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-16">
      <PixelCard className="flex flex-col items-center gap-4 text-center">
        <span className="text-primary">{icon}</span>
        <h1 className="text-primary text-xl">{title}</h1>
        {children}
      </PixelCard>
    </main>
  );
}

function Done() {
  return (
    <Shell icon={<CheckCircle2 size={40} aria-hidden />} title="You're on Klect Pro">
      <p className="text-muted text-sm">
        Unlimited lists and bookmarks, on web and iOS. Anything that was locked
        is unlocked again, exactly as you left it.
      </p>
      <Link href="/">
        <PixelButton size="sm">Back to your lists</PixelButton>
      </Link>
    </Shell>
  );
}

function Syncing() {
  return (
    <Shell icon={<Loader size={40} aria-hidden />} title="Payment confirmed">
      <p className="text-muted text-sm">
        RevenueCat has your subscription and we&apos;re applying it to your
        account now. This usually takes a few seconds. Refresh this page and
        everything will be unlocked.
      </p>
      <RefreshButton />
    </Shell>
  );
}

function Pending() {
  return (
    <Shell icon={<Loader size={40} aria-hidden />} title="Still processing">
      <p className="text-muted text-sm">
        We haven&apos;t seen the subscription on your account yet. If you just
        paid, give it a moment and refresh. If you cancelled at checkout,
        nothing was charged.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <RefreshButton />
        <Link href="/upgrade">
          <PixelButton variant="secondary" size="sm">
            Back to plans
          </PixelButton>
        </Link>
      </div>
    </Shell>
  );
}
