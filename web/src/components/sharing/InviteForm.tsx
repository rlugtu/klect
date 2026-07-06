"use client";

import { useActionState } from "react";
import { inviteToList, type InviteState } from "@/lib/actions/sharing";
import { PixelInput } from "@/components/ui/PixelInput";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function InviteForm({ listId }: { listId: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(
    inviteToList.bind(null, listId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-stretch gap-2">
        <PixelInput
          name="email"
          type="email"
          placeholder="friend@example.com"
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
    </form>
  );
}
