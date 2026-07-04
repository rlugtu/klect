"use client";

import { PixelInput } from "@/components/ui/PixelInput";
import { EmojiField } from "@/components/ui/EmojiField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldLabel } from "@/components/ui/FieldLabel";

export type ListDefaults = {
  name: string;
  description: string;
  icon: string;
};

/** Create/edit form for a list. Pass the appropriate server action. */
export function ListForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Partial<ListDefaults>;
  submitLabel: string;
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

      <SubmitButton label={submitLabel} pendingLabel="Saving…" />
    </form>
  );
}
