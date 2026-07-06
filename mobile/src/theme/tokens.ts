/**
 * Saive design tokens. Pixel/Modern mirror web/src/app/globals.css; **Journal** is
 * a mobile-first family (warm "scrapbook" theme) — see mobile/docs/design.md. Mobile
 * can't import web at runtime, so these mirror the web values as data; keep in sync.
 */

export type ThemeName =
  | 'PIXEL_LIGHT'
  | 'PIXEL_DARK'
  | 'MODERN_LIGHT'
  | 'MODERN_DARK'
  | 'JOURNAL_LIGHT'
  | 'JOURNAL_DARK';

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
  // Journal — warm terracotta/cream "scrapbook" (mobile-first). Default family.
  JOURNAL_LIGHT: {
    bg: '#f6efe4', panel: '#fffaf0', ink: '#2e2620', muted: '#8a7c6c',
    primary: '#b5502f', primaryInk: '#fff8f0', accent: '#c98a2c',
    danger: '#b23b3b', success: '#4f7a4a', warning: '#c98a2c', border: '#ded0ba',
  },
  JOURNAL_DARK: {
    bg: '#1c1712', panel: '#26201a', ink: '#f2e9dc', muted: '#a89787',
    primary: '#e08a5f', primaryInk: '#1c1712', accent: '#e0b25a',
    danger: '#e07a6b', success: '#7fae70', warning: '#e0b25a', border: '#3a3128',
  },
};

/** Per-family skin: border width + corner radii, in px. */
const SKIN = {
  PIXEL: { borderW: '2px', radius: '4px', radiusSm: '2px' },
  MODERN: { borderW: '1px', radius: '16px', radiusSm: '8px' },
  JOURNAL: { borderW: '1px', radius: '20px', radiusSm: '12px' },
} as const;

function skinFor(name: ThemeName) {
  if (name.startsWith('MODERN')) return SKIN.MODERN;
  if (name.startsWith('JOURNAL')) return SKIN.JOURNAL;
  return SKIN.PIXEL;
}

/**
 * CSS-variable map NativeWind consumes — color tokens plus skin vars (border width
 * + radius) that give each family its shape. Exposed as `border-skin` /
 * `rounded-skin[-sm]` utilities in tailwind.config.
 */
export function themeVars(name: ThemeName): Record<string, string> {
  const t = THEME_TOKENS[name];
  const skin = skinFor(name);
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
    '--border-w': skin.borderW,
    '--radius': skin.radius,
    '--radius-sm': skin.radiusSm,
  };
}
