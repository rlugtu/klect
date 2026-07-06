"use client";

import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * Add-a-comment form. React 19 auto-resets the uncontrolled textarea after a
 * successful action, so no manual clearing is needed.
 */
export function CommentForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="flex flex-col gap-2">
      <PixelTextarea
        name="value"
        rows={2}
        required
        placeholder="Add a comment…"
      />
      <div className="self-end">
        <SubmitButton label="Post" pendingLabel="Posting…" size="sm" />
      </div>
    </form>
  );
}
