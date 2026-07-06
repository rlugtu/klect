import { cn } from "@/lib/utils";

/** Read-only 0–5 star display. */
export function StarRating({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const filled = Math.min(5, Math.max(0, value));
  return (
    <span
      className={cn("text-warning tracking-widest select-none", className)}
      aria-label={`${filled} out of 5 stars`}
    >
      {"★".repeat(filled)}
      <span className="text-muted">{"☆".repeat(5 - filled)}</span>
    </span>
  );
}
