"use client";

import { useActionState, useState } from "react";
import { sendFriendRequest, type FriendState } from "@/lib/actions/friends";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UserPlus, X } from "lucide-react";

/** Right-aligned "Add friends" trigger that expands a @handle → friend-request form. */
export function AddFriendForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FriendState, FormData>(
    sendFriendRequest,
    {},
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <PixelButton
          variant="secondary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={14} aria-hidden /> : <UserPlus size={14} aria-hidden />}
          {open ? "Cancel" : "Add friends"}
        </PixelButton>
      </div>
      {open && (
        <PixelCard>
          <form action={formAction} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-stretch gap-2">
              <PixelInput
                name="handle"
                placeholder="@handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="min-w-48 flex-1"
              />
              <SubmitButton label="Send request" pendingLabel="…" size="sm" />
            </div>
            {state.error && <p className="text-danger text-sm">{state.error}</p>}
            {state.success && (
              <p className="text-success text-sm">{state.success}</p>
            )}
          </form>
        </PixelCard>
      )}
    </div>
  );
}
