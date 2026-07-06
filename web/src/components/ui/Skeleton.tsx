import { cn } from "@/lib/utils";

/** Pulsing placeholder block with the pixel border. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("pixel-box-sm bg-panel/60 animate-pulse", className)}
      aria-hidden
    />
  );
}
