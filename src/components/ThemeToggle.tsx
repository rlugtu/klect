"use client";

import { useState } from "react";
import { PixelButton } from "@/components/ui/PixelButton";

type Theme = "pixel-light" | "pixel-dark";

/**
 * Flips the `data-theme` attribute on <html> to preview both pixel palettes.
 * Legacy showcase helper (not wired into the app; theme persistence lives in
 * ProfileForm + user.theme).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("pixel-dark");

  function toggle() {
    const next: Theme = theme === "pixel-dark" ? "pixel-light" : "pixel-dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  }

  return (
    <PixelButton variant="secondary" size="sm" onClick={toggle}>
      {theme === "pixel-dark" ? "☀ light" : "☾ dark"}
    </PixelButton>
  );
}
