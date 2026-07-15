"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  addFriendToLists,
  removeFriend,
  type InviteState,
} from "@/lib/actions/friends";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { atHandle } from "@/lib/handle";
import { Pencil, Plus, X } from "lucide-react";

type Friend = {
  id: string;
  handle: string | null;
  icon: string | null;
};
type ListOption = { id: string; name: string; icon: string };

/**
 * A friend row. Name + email, with Edit (remove friend) and Add (multiselect of the
 * user's lists + role → send join requests) panels that expand below the row. The Add
 * panel pre-checks lists the friend already belongs to and closes itself on success.
 */
export function FriendRow({
  friendshipId,
  friend,
  lists,
  memberListIds,
}: {
  friendshipId: string;
  friend: Friend;
  lists: ListOption[];
  memberListIds: string[];
}) {
  const [panel, setPanel] = useState<null | "edit" | "add">(null);
  const [state, formAction] = useActionState<InviteState, FormData>(
    addFriendToLists.bind(null, friend.id),
    {},
  );

  const name = atHandle(friend.handle);
  const toggle = (p: "edit" | "add") =>
    setPanel((cur) => (cur === p ? null : p));

  return (
    <PixelCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/users/${friend.handle ?? friend.id}`}
          className="flex min-w-0 items-center gap-2 hover:text-primary"
        >
          <span aria-hidden className="text-lg">
            {friend.icon ?? "🔖"}
          </span>
          <span className="truncate text-sm font-semibold">{name}</span>
        </Link>
        <span className="flex shrink-0 items-center gap-2">
          <PixelButton
            variant="secondary"
            size="xs"
            onClick={() => toggle("edit")}
          >
            {panel === "edit" ? (
              <X size={14} aria-hidden />
            ) : (
              <Pencil size={14} aria-hidden />
            )}
            Edit
          </PixelButton>
          <PixelButton
            variant="secondary"
            size="xs"
            onClick={() => toggle("add")}
          >
            {panel === "add" ? (
              <X size={14} aria-hidden />
            ) : (
              <Plus size={14} aria-hidden />
            )}
            Add
          </PixelButton>
        </span>
      </div>

      {panel === "edit" && (
        <div className="border-border flex flex-col gap-2 border-t-2 pt-3">
          <span className="font-pixel text-muted text-sm uppercase">
            Remove friend
          </span>
          <ConfirmDeleteButton
            action={removeFriend.bind(null, friendshipId)}
            label="Remove friend"
            confirmText="Remove this friend?"
          />
        </div>
      )}

      {panel === "add" && (
        <form
          action={formAction}
          onSubmit={() => setPanel(null)}
          className="border-border flex flex-col gap-3 border-t-2 pt-3"
        >
          <span className="font-pixel text-muted text-sm uppercase">
            Add to lists
          </span>
          {lists.length === 0 ? (
            <p className="text-muted text-sm">You don&apos;t own any lists yet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {lists.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="listIds"
                      value={l.id}
                      defaultChecked={memberListIds.includes(l.id)}
                    />
                    <span aria-hidden>{l.icon}</span>
                    <span className="truncate">{l.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  name="role"
                  defaultValue="COLLABORATOR"
                  className="pixel-box-sm bg-panel text-ink cursor-pointer px-2 py-1 text-sm"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="COLLABORATOR">Collaborator</option>
                </select>
                <SubmitButton label="Send requests" pendingLabel="…" size="sm" />
              </div>
            </>
          )}
        </form>
      )}

      {state.error && <p className="text-danger text-sm">{state.error}</p>}
    </PixelCard>
  );
}
