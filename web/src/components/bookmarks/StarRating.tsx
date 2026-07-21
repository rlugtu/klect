import { cn } from "@/lib/utils";

/** Read-only 0–5 star display, supporting half steps (each star fills 0/50/100%). */
export function StarRating({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const rating = Math.min(5, Math.max(0, value));
  return (
    <span
      className={cn("inline-flex select-none", className)}
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        // How much of this star is filled: 0, 0.5 or 1.
        const fill = Math.min(1, Math.max(0, rating - (n - 1)));
        return (
          <span key={n} className="relative inline-block leading-none">
            <span className="text-muted">☆</span>
            <span
              className="text-warning absolute inset-0 overflow-hidden whitespace-nowrap"
              style={{ width: `${fill * 100}%` }}
              aria-hidden
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}
