/**
 * Saive design tokens. **Canonical source: web/src/app/globals.css** (the CSS var
 * blocks per `data-theme`). Kept in sync here as plain data so NativeWind can drive
 * the same palette on native — mobile can't import web at runtime, so this mirrors
 * the web values. When the web palette changes, update both.
 */

export type ThemeName = 'PIXEL_LIGHT' | 'PIXEL_DARK' | 'MODERN_LIGHT' | 'MODERN_DARK';

export type TokenName =
  | 'bg'
  | 'panel'
  | 'ink'
  | 'muted'
  | 'primary'
  | 'primaryInk'
  | 'accent'
  | 'danger'
  | 'success'
  | 'warning'
  | 'border';

export const THEME_TOKENS: Record<ThemeName, Record<TokenName, string>> = {
  PIXEL_LIGHT: {
    bg: '#f5f1e6', panel: '#fffdf5', ink: '#241f31', muted: '#6b6478',
    primary: '#4f6df5', primaryInk: '#fffdf5', accent: '#e84c3d',
    danger: '#e43b44', success: '#3fa34d', warning: '#ffcf3f', border: '#241f31',
  },
  PIXEL_DARK: {
    bg: '#14142b', panel: '#1e1e3f', ink: '#eae6ff', muted: '#9a93c4',
    primary: '#6c8cff', primaryInk: '#0b0b1a', accent: '#ff6b6b',
    danger: '#ff5c5c', success: '#6bd68a', warning: '#ffd23f', border: '#cfc9ff',
  },
  MODERN_LIGHT: {
    bg: '#f7f7fb', panel: '#ffffff', ink: '#1c1c22', muted: '#71717a',
    primary: '#7c83ff', primaryInk: '#ffffff', accent: '#ec8bd0',
    danger: '#ef4444', success: '#34d399', warning: '#f59e0b', border: '#e6e6ef',
  },
  MODERN_DARK: {
    bg: '#101015', panel: '#1b1b22', ink: '#ededf2', muted: '#a1a1aa',
    primary: '#8b93ff', primaryInk: '#0b0b12', accent: '#f0a6dc',
    danger: '#f87171', success: '#4ade80', warning: '#fbbf24', border: '#2a2a33',
  },
};

/**
 * CSS-variable map NativeWind consumes — color tokens plus **skin** vars (border
 * width + radius) that give the pixel skin its chunky/blocky look and the modern
 * skin its thin/rounded look. Exposed as `border-skin` / `rounded-skin[-sm]`
 * utilities in tailwind.config. (The retro pixel *font* is a separate follow-up
 * needing expo-font.)
 */
export function themeVars(name: ThemeName): Record<string, string> {
  const t = THEME_TOKENS[name];
  const modern = name.startsWith('MODERN');
  return {
    '--color-bg': t.bg,
    '--color-panel': t.panel,
    '--color-ink': t.ink,
    '--color-muted': t.muted,
    '--color-primary': t.primary,
    '--color-primary-ink': t.primaryInk,
    '--color-accent': t.accent,
    '--color-danger': t.danger,
    '--color-success': t.success,
    '--color-warning': t.warning,
    '--color-border': t.border,
    '--border-w': modern ? '1px' : '2px',
    '--radius': modern ? '16px' : '4px',
    '--radius-sm': modern ? '8px' : '2px',
  };
}
