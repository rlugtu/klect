import { cn } from "@/lib/utils";

/** Subtle form-field label: bold, muted, non-caps. Shared across all forms. */
export function FieldLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-pixel text-sm font-bold text-muted", className)}
      {...props}
    />
  );
}
