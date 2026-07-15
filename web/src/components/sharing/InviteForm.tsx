"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteToList, type InviteState } from "@/lib/actions/sharing";
import { offerFriend } from "@/lib/actions/friends";
import { PixelInput } from "@/components/ui/PixelInput";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function InviteForm({ listId }: { listId: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteToList.bind(null, listId),
    {},
  );
  const [friended, setFriended] = useState<{ handle: string; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const offerHandle = state.offerFriend?.handle;

  return (
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
        <select
          name="role"
          defaultValue="VIEWER"
          className="pixel-box-sm bg-panel text-ink cursor-pointer px-2 text-base"
        >
          <option value="VIEWER">Viewer</option>
          <option value="COLLABORATOR">Collaborator</option>
        </select>
        <div className="flex justify-end w-full mt-4">
          <SubmitButton label="Invite" pendingLabel="…" />
        </div>
      </div>
      {state.error && <p className="text-danger text-sm">{state.error}</p>}
      {state.success && <p className="text-success text-sm">{state.success}</p>}
      {offerHandle && friended?.handle !== offerHandle && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted text-sm">
            @{offerHandle} isn&apos;t your friend yet.
          </span>
          <PixelButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await offerFriend(offerHandle);
                setFriended({
                  handle: offerHandle,
                  msg: res.success ?? res.error ?? "",
                });
              })
            }
          >
            Add as friend?
          </PixelButton>
        </div>
      )}
      {friended && friended.handle === offerHandle && (
        <p className="text-success text-sm">{friended.msg}</p>
      )}
    </form>
  );
}
