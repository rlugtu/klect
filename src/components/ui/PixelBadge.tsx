import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "accent" | "success";

const toneClasses: Record<Tone, string> = {
  default: "bg-panel text-ink",
  primary: "bg-primary text-primary-ink",
  accent: "bg-accent text-primary-ink",
  success: "bg-success text-primary-ink",
};

export interface PixelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** When provided, renders a small × button to remove the badge (tag pills). */
  onRemove?: () => void;
}

/** Small pill used for tags/labels. Optionally removable. */
export function PixelBadge({
  className,
  tone = "default",
  onRemove,
  children,
  ...props
}: PixelBadgeProps) {
  return (
    <span
      className={cn(
        "font-pixel inline-flex items-center gap-1.5 px-2 py-1 text-sm uppercase",
        "border-2 border-border",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="cursor-pointer leading-none hover:text-danger"
        >
          ×
        </button>
      )}
    </span>
  );
}
