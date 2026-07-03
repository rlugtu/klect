"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { cn } from "@/lib/utils";

const ICON_CHOICES = ["🔖", "📚", "🎮", "🍜", "✈️", "🎬", "🎵", "💻", "🏠", "⭐"];

export type ProfileDefaults = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  birthday: string | null; // yyyy-mm-dd
  icon: string | null;
  theme: "LIGHT" | "DARK";
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
  const [theme, setTheme] = useState<"LIGHT" | "DARK">(defaults.theme);

  // Preview theme live as the user picks it.
  function pickTheme(next: "LIGHT" | "DARK") {
    setTheme(next);
    document.documentElement.setAttribute(
      "data-theme",
      next.toLowerCase(),
    );
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
        <div className="flex gap-3">
          <PixelButton
            type="button"
            size="sm"
            variant={theme === "LIGHT" ? "primary" : "secondary"}
            onClick={() => pickTheme("LIGHT")}
          >
            ☀ Light
          </PixelButton>
          <PixelButton
            type="button"
            size="sm"
            variant={theme === "DARK" ? "primary" : "secondary"}
            onClick={() => pickTheme("DARK")}
          >
            ☾ Dark
          </PixelButton>
        </div>
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
