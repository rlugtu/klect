"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_CHOICES = [
  "📁", "📚", "🎮", "🍜", "✈️", "🎬", "🎵", "💻",
  "🏠", "⭐", "🗺️", "🛒", "🎨", "📺", "☕", "🔖",
];

/** Hidden input + preset emoji buttons. Submits the picked emoji under `name`. */
export function EmojiField({
  name,
  defaultValue,
  choices = DEFAULT_CHOICES,
}: {
  name: string;
  defaultValue?: string | null;
  choices?: string[];
}) {
  const [value, setValue] = useState(defaultValue ?? choices[0]);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setValue(choice)}
            aria-pressed={value === choice}
            className={cn(
              "pixel-box-sm h-10 w-10 text-lg bg-panel cursor-pointer",
              value === choice && "border-primary bg-primary/20",
            )}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}
