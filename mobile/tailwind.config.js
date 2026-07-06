/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Semantic Saive colors -> CSS vars set per theme by ThemeProvider (vars()).
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
      // Journal type: Newsreader (serif) for titles, Work Sans for UI. Custom fonts
      // are loaded per-weight (RN doesn't synthesize weights), so weight = family.
      fontFamily: {
        serif: ["Newsreader_600SemiBold"],
        "serif-italic": ["Newsreader_500Medium_Italic"],
        sans: ["WorkSans_400Regular"],
        "sans-medium": ["WorkSans_500Medium"],
        "sans-semibold": ["WorkSans_600SemiBold"],
      },
    },
  },
  plugins: [],
};
