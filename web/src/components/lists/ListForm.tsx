"use client";

import { PixelInput } from "@/components/ui/PixelInput";
import { EmojiField } from "@/components/ui/EmojiField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldLabel } from "@/components/ui/FieldLabel";

export type ListDefaults = {
  name: string;
  description: string;
  icon: string;
  isPublic: boolean;
};

/**
 * Create/edit form for a list. Pass the appropriate server action.
 * `showVisibility` renders the public/private toggle (create flow only —
 * visibility on existing lists is an owner-only control, handled elsewhere).
 */
export function ListForm({
  action,
  defaults,
  submitLabel,
  showVisibility = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<ListDefaults>;
  submitLabel: string;
  showVisibility?: boolean;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Name *</FieldLabel>
        <PixelInput
          name="name"
          defaultValue={defaults?.name ?? ""}
          placeholder="Weekend trips"
          required
          autoFocus
          maxLength={30}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Description</FieldLabel>
        <PixelInput
          name="description"
          defaultValue={defaults?.description ?? ""}
          placeholder="Places to go someday"
        />
      </label>

      <div className="flex flex-col gap-2">
        <FieldLabel>Icon</FieldLabel>
        <EmojiField name="icon" defaultValue={defaults?.icon} />
      </div>

      {showVisibility && (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="isPublic"
            value="on"
            defaultChecked={defaults?.isPublic ?? false}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
          />
          <span className="flex flex-col gap-0.5">
            <FieldLabel>Public list</FieldLabel>
            <span className="text-muted text-xs">
              Anyone can view it (read-only) and it shows on your profile.
              Private by default.
            </span>
          </span>
        </label>
      )}

      <SubmitButton label={submitLabel} pendingLabel="Saving…" />
    </form>
  );
}
