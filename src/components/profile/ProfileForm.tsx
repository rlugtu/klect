"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { THEME_OPTIONS, themeDataAttr } from "@/lib/theme";
import { type Theme } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ICON_CHOICES = ["🔖", "📚", "🎮", "🍜", "✈️", "🎬", "🎵", "💻", "🏠", "⭐"];

export type ProfileDefaults = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  birthday: string | null; // yyyy-mm-dd
  icon: string | null;
  theme: Theme;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <PixelButton type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving…" : label}
    </PixelButton>
  );
}

export function ProfileForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults: ProfileDefaults;
  submitLabel: string;
}) {
  const [icon, setIcon] = useState(defaults.icon ?? "🔖");
  const [theme, setTheme] = useState<Theme>(defaults.theme);

  // Preview theme live as the user picks it.
  function pickTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", themeDataAttr(next));
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="theme" value={theme} />

      <label className="flex flex-col gap-1.5">
        <span className="font-pixel text-sm uppercase">Display name *</span>
        <PixelInput
          name="displayName"
          defaultValue={defaults.displayName ?? ""}
          placeholder="Player One"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-pixel text-sm uppercase">First name</span>
          <PixelInput name="firstName" defaultValue={defaults.firstName ?? ""} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-pixel text-sm uppercase">Last name</span>
          <PixelInput name="lastName" defaultValue={defaults.lastName ?? ""} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-pixel text-sm uppercase">Birthday</span>
        <PixelInput
          type="date"
          name="birthday"
          defaultValue={defaults.birthday ?? ""}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="font-pixel text-sm uppercase">Avatar</span>
        <div className="flex flex-wrap gap-2">
          {ICON_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setIcon(choice)}
              className={cn(
                "pixel-box-sm h-11 w-11 text-xl bg-panel cursor-pointer",
                icon === choice && "border-primary bg-primary/20",
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-pixel text-sm uppercase">Theme</span>
        <div className="flex flex-wrap gap-3">
          {THEME_OPTIONS.map((opt) => (
            <PixelButton
              key={opt.value}
              type="button"
              size="sm"
              variant={theme === opt.value ? "primary" : "secondary"}
              onClick={() => pickTheme(opt.value)}
            >
              {opt.label}
            </PixelButton>
          ))}
        </div>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
