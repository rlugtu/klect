"use client";

import { useState } from "react";
import { PixelButton } from "@/components/ui/PixelButton";
import { SubmitButton } from "@/components/ui/SubmitButton";

/** Two-step delete: click reveals an inline confirm (no blocking dialog). */
export function ConfirmDeleteButton({
  action,
  label = "Delete",
  confirmText = "Delete this?",
}: {
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  confirmText?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <PixelButton
        variant="danger"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        {label}
      </PixelButton>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <span className="text-danger text-sm">{confirmText}</span>
      <SubmitButton
        label="Yes"
        pendingLabel="Deleting…"
        variant="danger"
        size="sm"
      />
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted hover:text-ink cursor-pointer text-sm"
      >
        Cancel
      </button>
    </form>
  );
}
