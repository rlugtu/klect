"use client";

import { useFormStatus } from "react-dom";
import { PixelButton, type PixelButtonProps } from "@/components/ui/PixelButton";

/** Submit button that disables + relabels itself while the form action runs. */
export function SubmitButton({
  label,
  pendingLabel = "…",
  ...props
}: { label: string; pendingLabel?: string } & Omit<
  PixelButtonProps,
  "children" | "type"
>) {
  const { pending } = useFormStatus();
  return (
    <PixelButton type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : label}
    </PixelButton>
  );
}
