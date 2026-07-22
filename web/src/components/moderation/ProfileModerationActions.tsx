"use client";

import { useState, useTransition } from "react";
import { blockUser, unblockUser } from "@/lib/actions/moderation";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelBadge } from "@/components/ui/PixelBadge";
import { ReportControl } from "@/components/moderation/ReportControl";
import { Ban } from "lucide-react";

/**
 * Block / unblock + report controls on another user's profile. When `blocked` is true the
 * profile is already hidden by the server, so we only show the blocked notice + Unblock;
 * otherwise a two-step Block and a Report-user control.
 */
export function ProfileModerationActions({
  targetUserId,
  handle,
  blocked,
}: {
  targetUserId: string;
  handle: string | null;
  blocked: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function doBlock() {
    startTransition(async () => {
      try {
        await blockUser(targetUserId, handle ?? undefined);
        toast.success("User blocked.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't block.");
      }
    });
  }

  function doUnblock() {
    startTransition(async () => {
      try {
        await unblockUser(targetUserId, handle ?? undefined);
        toast.success("User unblocked.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't unblock.");
      }
    });
  }

  if (blocked) {
    return (
      <div className="flex flex-col items-center gap-2">
        <PixelBadge tone="accent">You blocked this user</PixelBadge>
        <PixelButton variant="secondary" size="sm" onClick={doUnblock} disabled={pending}>
          {pending ? "Unblocking…" : "Unblock"}
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-danger text-sm">Block this user?</span>
            <PixelButton variant="danger" size="sm" onClick={doBlock} disabled={pending}>
              {pending ? "Blocking…" : "Yes, block"}
            </PixelButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-muted hover:text-ink cursor-pointer text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <PixelButton variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Ban size={13} aria-hidden /> Block
          </PixelButton>
        )}
      </div>
      <ReportControl targetType="USER" targetId={targetUserId} triggerLabel="Report user" />
    </div>
  );
}
