"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { sendFeedback } from "@/lib/actions/feedback";
import { PixelTextarea } from "@/components/ui/PixelTextarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldLabel } from "@/components/ui/FieldLabel";

const CATEGORIES = [
  { value: "bug", label: "🐛 Bug" },
  { value: "idea", label: "💡 Idea" },
  { value: "other", label: "💬 Other" },
] as const;

export function FeedbackForm() {
  const [category, setCategory] = useState<string>("idea");
  const [message, setMessage] = useState("");

  return (
    <form action={sendFeedback} className="flex flex-col gap-4">
      <input type="hidden" name="category" value={category} />

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Type</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "pixel-box-sm cursor-pointer px-3 py-1.5 text-sm transition-colors",
                category === c.value
                  ? "bg-primary text-primary-ink"
                  : "bg-panel text-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Message</FieldLabel>
        <PixelTextarea
          name="message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="What's on your mind? Bugs, ideas, anything…"
        />
      </div>

      <SubmitButton
        label="Send feedback"
        pendingLabel="Sending…"
        disabled={!message.trim()}
      />
    </form>
  );
}
