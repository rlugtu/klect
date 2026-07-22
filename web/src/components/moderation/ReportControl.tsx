"use client";

import { useState, useTransition } from "react";
import { reportContent } from "@/lib/actions/moderation";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import { Flag } from "lucide-react";

/** Report reasons — labels mirror the mobile report sheet + core REPORT_REASONS. */
export const REPORT_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "sexual", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "other", label: "Something else" },
];

type TargetType = "USER" | "COMMENT" | "MESSAGE" | "LIST_CHAT_MESSAGE";

/**
 * A compact inline "Report" affordance: a small trigger that expands a reason picker +
 * optional note and submits via the `reportContent` server action. Reused on profiles,
 * comments, DM messages, and list-chat messages.
 */
export function ReportControl({
  targetType,
  targetId,
  triggerLabel = "Report",
  triggerVariant = "ghost",
}: {
  targetType: TargetType;
  targetId: string;
  triggerLabel?: string;
  triggerVariant?: "ghost" | "secondary" | "danger";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!reason) {
      toast.error("Pick a reason.");
      return;
    }
    startTransition(async () => {
      try {
        await reportContent({ targetType, targetId, reason, note });
        toast.success("Thanks — our team will review this.");
        setOpen(false);
        setReason("");
        setNote("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't submit report.");
      }
    });
  }

  if (!open) {
    return (
      <PixelButton
        variant={triggerVariant}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Flag size={13} aria-hidden /> {triggerLabel}
      </PixelButton>
    );
  }

  return (
    <div className="pixel-box bg-panel flex flex-col gap-3 p-3">
      <p className="font-pixel text-xs">Why are you reporting this?</p>
      <div className="flex flex-col gap-1.5">
        {REPORT_REASON_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reason"
              value={o.value}
              checked={reason === o.value}
              onChange={() => setReason(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      <textarea
        className="pixel-box bg-bg min-h-16 p-2 text-sm"
        placeholder="Add details (optional)"
        value={note}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <PixelButton
          variant="danger"
          size="sm"
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Submitting…" : "Submit report"}
        </PixelButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-ink cursor-pointer text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
