"use client";

import { setListVisibility } from "@/lib/actions/lists";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Globe, Lock } from "lucide-react";

/** Owner-only public/private switch for a list. */
export function ListVisibilityToggle({
  listId,
  isPublic,
}: {
  listId: string;
  isPublic: boolean;
}) {
  return (
    <form
      action={setListVisibility.bind(null, listId, !isPublic)}
      className="pixel-box bg-panel flex flex-wrap items-center justify-between gap-3 p-3"
    >
      <span className="flex items-center gap-2">
        {isPublic ? (
          <Globe size={16} aria-hidden />
        ) : (
          <Lock size={16} aria-hidden />
        )}
        <span className="flex flex-col">
          <span className="font-pixel text-sm">
            {isPublic ? "Public" : "Private"}
          </span>
          <span className="text-muted text-xs">
            {isPublic
              ? "Anyone can view this list and it shows on your profile."
              : "Only members can view this list."}
          </span>
        </span>
      </span>
      <SubmitButton
        variant="secondary"
        size="sm"
        label={isPublic ? "Make private" : "Make public"}
        pendingLabel="Saving…"
      />
    </form>
  );
}
