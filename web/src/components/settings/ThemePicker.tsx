"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { THEME_OPTIONS, themeDataAttr } from "@/lib/theme";
import { type Theme } from "@/generated/prisma/enums";
import { toast } from "@/lib/toast";
import { PixelButton } from "@/components/ui/PixelButton";
import type { ProfileDefaults } from "@/components/profile/ProfileForm";

/**
 * Appearance section (lg+ settings): the six themes as live previews.
 *
 * Each swatch is a real radio input (arrow keys move between themes) whose
 * preview carries its own `data-theme`, so it is drawn with that theme's real
 * tokens and fonts rather than a screenshot. Picking one previews it on the
 * whole page straight away, as the profile form's picker does; Save persists it.
 *
 * Saving goes through the same `updateProfile` action the profile form uses.
 * That action saves the whole profile, so the current handle, names and avatar
 * ride along as hidden fields (from props, so they are always the saved values,
 * never another form's unsaved edits).
 *
 * Leaving the section without saving puts the saved theme back, so a preview
 * never outlives the page that made it.
 */
export function ThemePicker({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: ProfileDefaults;
}) {
  const [theme, setTheme] = useState<Theme>(defaults.theme);
  const saved = useRef(defaults.theme);

  useEffect(() => {
    saved.current = defaults.theme;
  }, [defaults.theme]);

  useEffect(() => {
    return () => {
      document.documentElement.setAttribute(
        "data-theme",
        themeDataAttr(saved.current),
      );
    };
  }, []);

  function pick(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", themeDataAttr(next));
  }

  async function save(formData: FormData) {
    try {
      await action(formData);
      saved.current = theme;
      toast.success("Theme saved.");
    } catch {
      toast.error("Couldn't save the theme.");
    }
  }

  const current = THEME_OPTIONS.find((o) => o.value === defaults.theme);

  return (
    <form action={save} className="flex flex-col gap-5">
      <input type="hidden" name="handle" value={defaults.handle ?? ""} />
      <input type="hidden" name="firstName" value={defaults.firstName ?? ""} />
      <input type="hidden" name="lastName" value={defaults.lastName ?? ""} />
      <input type="hidden" name="icon" value={defaults.icon ?? ""} />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-muted mb-3 text-sm">
          Three families, each in light and dark. Saved theme:{" "}
          <span className="text-ink">{current?.label ?? "Modern Light"}</span>.
        </legend>
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const [family, mode] = opt.label.split(" ");
            const on = theme === opt.value;
            return (
              <label key={opt.value} className="theme-swatch relative cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={on}
                  onChange={() => pick(opt.value)}
                  className="sr-only"
                />
                <span className="theme-frame">
                  <span className="theme-prev" data-theme={opt.dataAttr} aria-hidden>
                    <span className="tp-side">
                      <i className="on" />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="tp-main">
                      <span className="tp-title">Jersey City Coffee</span>
                      <span className="tp-card">
                        <span className="tp-photo" />
                        <span className="tp-title">Paulus Hook</span>
                      </span>
                      <span className="tp-btn">+ Bookmark</span>
                    </span>
                  </span>
                </span>
                {on && (
                  <span
                    aria-hidden
                    className="bg-primary text-primary-ink absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full"
                  >
                    <Check size={14} />
                  </span>
                )}
                <span className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">{family}</span>
                  <span className="text-muted">{mode}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <SaveButton unchanged={theme === defaults.theme} />
        {theme !== defaults.theme && (
          <span className="text-muted text-sm">Previewing. Save to keep it.</span>
        )}
      </div>
    </form>
  );
}

function SaveButton({ unchanged }: { unchanged: boolean }) {
  const { pending } = useFormStatus();
  return (
    <PixelButton type="submit" size="sm" disabled={pending || unchanged}>
      {pending ? "Saving…" : "Save theme"}
    </PixelButton>
  );
}
