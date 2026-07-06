"use client";

import { useTransition } from "react";
import { changeMemberRole } from "@/lib/actions/sharing";

/** Owner control to switch a member between viewer and collaborator. */
export function RoleSelect({
  listId,
  userId,
  role,
}: {
  listId: string;
  userId: string;
  role: "VIEWER" | "COLLABORATOR";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as "VIEWER" | "COLLABORATOR";
        startTransition(() => {
          void changeMemberRole(listId, userId, next);
        });
      }}
      className="pixel-box-sm bg-panel text-ink cursor-pointer px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="VIEWER">Viewer</option>
      <option value="COLLABORATOR">Collaborator</option>
    </select>
  );
}
