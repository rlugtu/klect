"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRequest, rejectRequest } from "@/lib/actions/sharing";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";

/**
 * Approve / Reject for one pending list invite in the home attention column.
 * Calls the same server actions as /requests (each re-checks that the invite
 * belongs to the signed-in user), then toasts the result. The actions do not
 * redirect, so the toast is shown here after the await rather than through a
 * flash cookie. Their revalidation plus `router.refresh()` drop the row and
 * update the sidebar; the row hides itself straight away on success.
 */
export function AttentionRequestActions({
  inviteId,
  listName,
}: {
  inviteId: string;
  listName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function run(
    action: (id: string) => Promise<void>,
    success: string,
    failure: string,
  ) {
    startTransition(async () => {
      try {
        await action(inviteId);
        setDone(true);
        toast.success(success);
        router.refresh();
      } catch {
        // Production strips thrown messages, so a fixed sentence is shown.
        toast.error(failure);
      }
    });
  }

  if (done) return null;

  return (
    <div className="flex items-center gap-2">
      <PixelButton
        size="xs"
        disabled={pending}
        onClick={() =>
          run(
            approveRequest,
            `You joined ${listName}.`,
            "Couldn't approve the request.",
          )
        }
      >
        Approve
      </PixelButton>
      <PixelButton
        size="xs"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run(rejectRequest, "Request rejected.", "Couldn't reject the request.")
        }
      >
        Reject
      </PixelButton>
    </div>
  );
}
