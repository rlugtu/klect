import { cn } from "@/lib/utils";

/** Panel surface with a hard pixel border + drop shadow. */
export function PixelCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("pixel-box bg-panel text-ink p-5", className)}
      {...props}
    />
  );
}
