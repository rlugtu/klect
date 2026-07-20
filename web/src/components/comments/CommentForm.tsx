"use client";

import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { toast, errorMessage } from "@/lib/toast";

/**
 * Add-a-comment form. React 19 auto-resets the uncontrolled textarea after a
 * successful action, so no manual clearing is needed. The bound server action is
 * wrapped so we can surface a success/error toast without losing that reset (the
 * server action still runs inside the form-action transition).
 */
export function CommentForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  async function submit(formData: FormData) {
    try {
      await action(formData);
      toast.success("Comment posted");
    } catch (e) {
      toast.error(errorMessage(e, "Could not post comment"));
    }
  }

  return (
    <form action={submit} className="flex flex-col gap-2">
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
