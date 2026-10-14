/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Semantic Klect colors -> CSS vars set per theme by ThemeProvider (vars()).
      colors: {
        bg: "var(--color-bg)",
        panel: "var(--color-panel)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        primary: "var(--color-primary)",
        "primary-ink": "var(--color-primary-ink)",
        accent: "var(--color-accent)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        border: "var(--color-border)",
      },
      // Skin knobs — driven per theme by ThemeProvider vars() (pixel vs modern).
      borderWidth: { skin: "var(--border-w)" },
      borderRadius: { skin: "var(--radius)", "skin-sm": "var(--radius-sm)" },
      // Font families -> CSS vars set per theme by ThemeProvider (vars()), same as
      // colors above. Modern = Geist; Journal/Pixel = Newsreader (titles) + Work Sans.
      // Custom fonts are loaded per-weight (RN doesn't synthesize weights), so the
      // var resolves to a specific loaded "weight = family" name.
      fontFamily: {
        serif: ["var(--font-title)"],
        "serif-italic": ["var(--font-title-italic)"],
        sans: ["var(--font-body)"],
        "sans-medium": ["var(--font-body-medium)"],
        "sans-semibold": ["var(--font-body-semibold)"],
        // Tailwind's weight utilities only emit fontWeight, and RN can't synthesize a
        // weight into a custom family, so `font-bold`/`font-semibold` used without a
        // family class silently rendered in the OS font. Aliasing them here lands them
        // on a real loaded face (600 is the heaviest weight the app ships). Tailwind
        // emits these before `font-sans*`/`font-serif*`, so an explicit family class
        // paired with one of them still wins.
        semibold: ["var(--font-body-semibold)"],
        bold: ["var(--font-body-semibold)"],
      },
    },
  },
  plugins: [],
};
