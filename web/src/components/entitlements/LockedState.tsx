import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * How a locked list or bookmark looks. The read-only half of Stage 4.
 *
 * A lapsed over-cap account keeps everything it had: the rows it did not pick in
 * the downgrade selection get `lockedAt` stamped and stay exactly where they were,
 * readable and deletable but not editable (see `LockedError` in core/lists.ts for
 * the contract the server enforces). Without a visual treatment those rows look
 * identical to active ones, so the only way to discover the lock is to try an edit
 * and have it refused. These two pieces are the fix, and they live in one file so
 * every surface says "locked" the same way.
 *
 * - {@link LockedBadge} labels the row. It is deliberately a plain `PixelBadge`
 *   with a leading icon, the same shape as the "Public" and role badges already on
 *   list cards and the list header, rather than a new visual language.
 * - {@link LockedNotice} explains it where there is room to explain, and offers the
 *   one action that lifts the lock.
 */

/** Which kind of row is locked — picks the copy and the paywall's `reason`. */
export type LockedKind = "list" | "bookmark";

/**
 * Dim applied to a locked row's artwork (a list's emoji, a bookmark's thumbnail).
 * Only the art is dimmed, never the badge, so the label stays fully legible on top
 * of the muted card.
 */
export const LOCKED_ART = "opacity-50 grayscale";

/** "Locked" pill. Same construction as the Public / Collab / Viewer badges. */
export function LockedBadge({ className }: { className?: string }) {
  return (
    <PixelBadge tone="default" className={cn("shrink-0 gap-1.5", className)}>
      <Lock size={12} aria-hidden /> Locked
    </PixelBadge>
  );
}

/**
 * Why this row is locked and what still works, with the one action that lifts it.
 *
 * `canUpgrade` is false for anyone who is not the owner: a collaborator looking at
 * someone else's locked list cannot lift that lock, and inviting them to pay for it
 * would be a lie. They get the same explanation without the call to action.
 *
 * Unwrapped, so it can sit inside a panel that is already a card. Most callers want
 * {@link LockedNotice}, which is this in its own card.
 */
export function LockedExplainer({
  kind,
  canUpgrade = true,
  className,
}: {
  kind: LockedKind;
  canUpgrade?: boolean;
  className?: string;
}) {
  const noun = kind === "list" ? "list" : "bookmark";
  const plural = kind === "list" ? "lists" : "bookmarks";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <h2 className="flex items-center gap-2 text-sm">
        <Lock size={14} aria-hidden /> This {noun} is locked
      </h2>
      {canUpgrade ? (
        <>
          <p className="text-muted text-sm">
            It is kept exactly as it was, outside your free {plural} limit. You can
            still read it, share it, and delete it — editing and adding are off
            until it unlocks.
          </p>
          <p className="text-muted text-sm">
            Subscribing again unlocks every list and bookmark you have, instantly.
          </p>
          <Link href={`/upgrade?reason=${plural}`} className="w-fit">
            <PixelButton size="sm">Upgrade to Pro</PixelButton>
          </Link>
        </>
      ) : (
        <p className="text-muted text-sm">
          The owner&apos;s account is over its free {plural} limit, so this {noun}{" "}
          is read-only for now. Nothing has been deleted.
        </p>
      )}
    </div>
  );
}

/** {@link LockedExplainer} on its own card, for a page body. */
export function LockedNotice({
  className,
  ...props
}: Parameters<typeof LockedExplainer>[0]) {
  return (
    <PixelCard className={className}>
      <LockedExplainer {...props} />
    </PixelCard>
  );
}
