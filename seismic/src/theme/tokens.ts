/**
 * Design tokens — single source of truth for the Petroleum Turquoise /
 * Metallic Gold glass theme. CSS custom properties (theme.css) and the 3D
 * scene materials both read from here, so the palette never drifts.
 */
export const palette = {
  petroleum900: "#00251F",
  petroleum800: "#00332B",
  petroleum700: "#004D40", // brand primary
  petroleum500: "#00796B",
  petroleum300: "#4DB6AC",
  gold500: "#D4AF37", // metallic gold accent
  gold300: "#F1D27A",
  gold700: "#A8832A",
  ink100: "#E8F3F1",
  ink300: "#A9C4BF",
  danger: "#FF6B6B",
  warning: "#FFB547",
  success: "#4ADE80",
} as const;

export type PaletteKey = keyof typeof palette;

export const glass = {
  background: "rgba(0, 77, 64, 0.35)",
  border: "rgba(212, 175, 55, 0.28)",
  blurPx: 16,
  shadow: "0 18px 40px rgba(0, 20, 16, 0.55), inset 0 1px 0 rgba(241, 210, 122, 0.12)",
  radiusPx: 18,
} as const;

/** Metallic sheen used on headings, primary buttons and active badges. */
export const goldGradient = `linear-gradient(135deg, ${palette.gold700} 0%, ${palette.gold300} 45%, ${palette.gold500} 60%, ${palette.gold700} 100%)`;

export const motion = {
  fastMs: 140,
  baseMs: 220,
  slowMs: 420,
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** Parses #RRGGBB into [r,g,b] 0–255. Throws on malformed input. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || !m[1]) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
