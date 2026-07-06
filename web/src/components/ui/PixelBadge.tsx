import { cn } from "@/lib/utils";
import { tagTextColor } from "@/lib/tag-colors";

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
  /** Explicit hex background (e.g. an assigned tag color); overrides `tone`. */
  color?: string;
  /** When provided, renders a small × button to remove the badge (tag pills). */
  onRemove?: () => void;
  /**
   * Marks this badge as a bookmark tag (vs. a status/role label). Adds the
   * `pixel-tag` hook the modern theme uses to soften tags into rounded,
   * non-uppercase pills. No effect in the pixel theme.
   */
  tag?: boolean;
}

/** Small pill used for tags/labels. Optionally removable. */
export function PixelBadge({
  className,
  tone = "default",
  color,
  onRemove,
  tag,
  children,
  style,
  ...props
}: PixelBadgeProps) {
  return (
    <span
      className={cn(
        "font-pixel inline-flex items-center gap-1.5 px-2 py-1 text-sm uppercase",
        "border-2 border-border",
        tag && "pixel-tag",
        !color && toneClasses[tone],
        className,
      )}
      style={
        color
          ? { backgroundColor: color, color: tagTextColor(color), ...style }
          : style
      }
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
