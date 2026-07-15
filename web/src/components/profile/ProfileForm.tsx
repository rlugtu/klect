"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { THEME_OPTIONS, themeDataAttr } from "@/lib/theme";
import { type Theme } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ICON_CHOICES = ["🔖", "📚", "🎮", "🍜", "✈️", "🎬", "🎵", "💻", "🏠", "⭐"];

export type ProfileDefaults = {
  firstName: string | null;
  lastName: string | null;
  handle: string | null;
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
        <FieldLabel>Handle *</FieldLabel>
        <div className="flex items-center gap-2">
          <span className="text-muted text-lg" aria-hidden>
            @
          </span>
          <PixelInput
            name="handle"
            defaultValue={defaults.handle ?? ""}
            placeholder="player_one"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="[A-Za-z0-9_]{3,20}"
            title="3–20 characters: letters, numbers, or underscores"
            required
            className="flex-1"
          />
        </div>
        <span className="text-muted text-xs">
          Lowercase letters, numbers, or underscores. 3–20 characters.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <FieldLabel>First name</FieldLabel>
          <PixelInput name="firstName" defaultValue={defaults.firstName ?? ""} />
        </label>
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Last name</FieldLabel>
          <PixelInput name="lastName" defaultValue={defaults.lastName ?? ""} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Birthday</FieldLabel>
        <PixelInput
          type="date"
          name="birthday"
          defaultValue={defaults.birthday ?? ""}
        />
      </label>

      <div className="flex flex-col gap-2">
        <FieldLabel>Avatar</FieldLabel>
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
        <FieldLabel>Theme</FieldLabel>
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
