import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Text input with a hard pixel border; highlights on focus. */
export const PixelInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "pixel-box-sm bg-panel text-ink w-full px-3 py-2.5 text-base",
        "placeholder:text-muted placeholder:text-sm outline-none",
        "focus:border-primary focus:shadow-[3px_3px_0_0_var(--primary)]",
        className,
      )}
      {...props}
    />
  );
});

PixelInput.displayName = "PixelInput";
