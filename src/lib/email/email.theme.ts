/**
 * FASE 2.5 — GamePro transactional email theme.
 *
 * Email clients do not support CSS variables, Tailwind, external stylesheets or
 * modern layout. Every token below is therefore a literal value, inlined at
 * render time. This file is the SINGLE source of truth for those literals — the
 * same dark esports identity the app uses, translated into what email supports.
 */
export const EMAIL_THEME = {
  /** Deep, neutral dark background (matches the app shell). */
  background: "#0B0F14",
  surface: "#111821",
  surfaceAlt: "#0E141B",
  border: "#1E2A36",
  /** GamePro signal colour. */
  primary: "#00E5A0",
  primaryContrast: "#04120C",
  accent: "#4DA3FF",
  danger: "#FF5A5F",
  warning: "#FFB020",
  textPrimary: "#F2F6FA",
  textSecondary: "#A7B5C2",
  textMuted: "#6F7F8D",
  radius: "12px",
  radiusSmall: "8px",
  maxWidth: "600px",
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
  monoFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

export type EmailTheme = typeof EMAIL_THEME;

/** Minimal HTML escaping. Every interpolated value passes through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
