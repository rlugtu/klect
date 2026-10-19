"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/Switch";
import {
  setDensity,
  setShortcutsEnabled,
  useDensity,
  useShortcutsEnabled,
  type Density,
} from "@/lib/desktop-prefs";

const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: "comfortable", label: "Comfortable", hint: "Roomier cards and gaps" },
  { id: "compact", label: "Compact", hint: "Tighter cards, more on screen" },
];

/**
 * Settings, Appearance (lg+): layout density and the keyboard shortcuts
 * switch. Both apply immediately and are saved in this browser only, per
 * account (see lib/desktop-prefs.ts); nothing is sent to the server.
 */
export function DesktopPrefs({ userId }: { userId: string }) {
  const density = useDensity(userId);
  const shortcutsOn = useShortcutsEnabled(userId);
  const switchLabel = useId();
  const switchHint = useId();

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          Density
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {DENSITIES.map((d) => {
            const on = density === d.id;
            return (
              <label
                key={d.id}
                className={cn(
                  "pixel-box-sm bg-panel flex cursor-pointer flex-col gap-0.5 px-3 py-2.5",
                  "has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  on && "outline-primary outline-2",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="radio"
                    name="density"
                    value={d.id}
                    checked={on}
                    onChange={() => setDensity(userId, d.id)}
                    className="accent-[var(--primary)]"
                  />
                  {d.label}
                </span>
                <span className="text-muted pl-6 text-xs">{d.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span id={switchLabel} className="text-sm font-semibold">
            Keyboard shortcuts
          </span>
          <span id={switchHint} className="text-muted text-xs">
            Single-key shortcuts such as G then H, C, / and ? (press ? to see them
            all), plus J and K in a list, and pasting a link outside a field to
            quick add it. Cmd/Ctrl+K, Esc and the arrow keys always work.
          </span>
        </div>
        <Switch
          checked={shortcutsOn}
          onCheckedChange={(next) => setShortcutsEnabled(userId, next)}
          aria-labelledby={switchLabel}
          aria-describedby={switchHint}
        />
      </div>

      <p className="text-muted text-xs">Saved in this browser only.</p>
    </div>
  );
}
