"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "role" | "aria-checked" | "onClick" | "onChange" | "children"
> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
};

/**
 * Accessible on/off switch (`role="switch"` on a native button, so Space and
 * Enter toggle it). Name it with `aria-label` or `aria-labelledby`.
 *
 * All visuals live in the `.ui-switch` rules in globals.css: square in the
 * pixel skin, a rounded pill in modern and journal. The thumb is a flex child
 * of the track (never absolutely positioned) and its travel is computed from
 * the same size variables, so it always sits inside the track.
 */
export function Switch({ checked, onCheckedChange, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn("ui-switch", className)}
      {...rest}
    >
      <span aria-hidden className="ui-switch-thumb" />
    </button>
  );
}
