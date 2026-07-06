import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Multiline input with a hard pixel border; highlights on focus. */
export const PixelTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "pixel-box-sm bg-panel text-ink w-full px-3 py-2.5 text-base",
        "placeholder:text-muted placeholder:text-sm outline-none resize-y",
        "focus:border-primary focus:shadow-[3px_3px_0_0_var(--primary)]",
        className,
      )}
      {...props}
    />
  );
});

PixelTextarea.displayName = "PixelTextarea";
