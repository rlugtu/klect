"use client";

import { useState, useTransition } from "react";
import { unblockUser } from "@/lib/actions/moderation";
import { toast } from "@/lib/toast";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelButton } from "@/components/ui/PixelButton";
import { atHandle } from "@/lib/handle";

type BlockedUser = {
  blockId: string;
  user: { id: string; handle: string | null; icon: string | null };
};

/** Manage the users you've blocked — list + one-tap unblock. */
export function BlockedUsersSection({ blocked }: { blocked: BlockedUser[] }) {
  const [rows, setRows] = useState(blocked);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function doUnblock(userId: string, handle: string | null) {
    setPendingId(userId);
    startTransition(async () => {
      try {
        await unblockUser(userId, handle ?? undefined);
        setRows((cur) => cur.filter((r) => r.user.id !== userId));
        toast.success("User unblocked.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't unblock.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <PixelCard>
      <h2 className="text-sm mb-4">Blocked users</h2>
      {rows.length === 0 ? (
        <p className="text-muted text-sm">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.blockId}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden>{r.user.icon ?? "🙂"}</span>
                <span className="truncate text-sm">{atHandle(r.user.handle)}</span>
              </span>
              <PixelButton
                variant="secondary"
                size="sm"
                disabled={pendingId === r.user.id}
                onClick={() => doUnblock(r.user.id, r.user.handle)}
              >
                {pendingId === r.user.id ? "Unblocking…" : "Unblock"}
              </PixelButton>
            </li>
          ))}
        </ul>
      )}
    </PixelCard>
  );
}
