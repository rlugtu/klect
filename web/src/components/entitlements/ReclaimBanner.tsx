"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * Home-page entry point into reclaim mode: "you have room, and you have locked
 * stuff, want it back?"
 *
 * The only way into `/downgrade` when nothing is owed. Over-cap accounts are
 * redirected there by `app/page.tsx`; this covers the other state the core status
 * reports (`canReclaim`: free, under both caps, locks still held), which has no
 * redirect by design. See the "two modes" note in `lib/core/active-selection.ts`.
 *
 * ## Why this is dismissible and not a gate
 *
 * Reclaim is available, not owed. The account is coherent: it is inside both free
 * caps, every active row works, and the locked rows are preserved and readable. A
 * user who deleted a list to make space for new work does not need to be nagged
 * into refilling it with old work. So this is a card that can be closed, never a
 * redirect and never a blocking modal.
 *
 * Dismissal is kept in `sessionStorage` rather than component state or the
 * database. Component state alone would not survive a navigation back to home,
 * which is the one place this renders, so it would read as undismissable. A
 * database column would make "I closed a banner" a permanent fact that then needs
 * its own reset rule for the next time the user trims down. Per-session is the
 * honest middle: gone for this visit, offered again next time, no schema.
 *
 * ## Why `useSyncExternalStore` and not `useState` + `useEffect`
 *
 * `sessionStorage` is an external store, and this is the hook for reading one
 * without the read-then-setState-in-an-effect cascade (which the lint rules here
 * reject, correctly). The server snapshot is "dismissed", so the markup that ships
 * contains no banner and a user who already closed it never sees it flash back in
 * before hydration; the client snapshot then reveals it on hydration for everyone
 * who has not.
 */

const DISMISS_KEY = "klect.reclaim-banner.dismissed";

/** Subscribers to re-read the flag after {@link dismiss} writes it. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Blocked or private-mode storage reads as "not dismissed": showing it is safe. */
function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Server render shows nothing, so a dismissed banner cannot flash in. */
function isDismissedOnServer(): boolean {
  return true;
}

function dismiss(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage is unavailable, so the dismissal cannot persist. Nothing else breaks,
    // and the notify below still hides the card for the rest of this page view.
  }
  for (const onChange of listeners) onChange();
}

export function ReclaimBanner() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, isDismissedOnServer);
  if (dismissed) return null;

  return (
    <PixelCard className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Lock size={16} className="text-muted mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm">You have room for locked items</h2>
          <p className="text-muted text-sm">
            You are back inside the free limits and still have locked lists or
            bookmarks saved. Bring some of them back whenever you like.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/downgrade">
          <PixelButton size="sm">Choose what to unlock</PixelButton>
        </Link>
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X size={14} aria-hidden />
        </PixelButton>
      </div>
    </PixelCard>
  );
}
