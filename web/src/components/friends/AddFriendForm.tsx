"use client";

import { useActionState, useEffect, useState } from "react";
import { sendFriendRequest, type FriendState } from "@/lib/actions/friends";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UserPlus, X } from "lucide-react";

/**
 * Right-aligned "Add friends" trigger that expands a @handle → friend-request form.
 * `inline` (the desktop messages workspace) skips the trigger and shows the field
 * straight away; same action, same toasts.
 */
export function AddFriendForm({ inline = false }: { inline?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FriendState, FormData>(
    sendFriendRequest,
    {},
  );

  // Surface the action's result as a toast (replaces the old inline lines).
  useEffect(() => {
    if (state.success) toast.success(state.success);
    else if (state.error) toast.error(state.error);
  }, [state]);

  if (inline) {
    return (
      <form action={formAction} className="flex items-stretch gap-2">
        <label className="sr-only" htmlFor="add-friend-inline">
          Add friend by handle
        </label>
        <PixelInput
          id="add-friend-inline"
          name="handle"
          placeholder="Add friend by @handle"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="min-w-0 flex-1"
        />
        <SubmitButton label="Add" pendingLabel="…" size="sm" />
      </form>
    );
  }

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
          </form>
        </PixelCard>
      )}
    </div>
  );
}
