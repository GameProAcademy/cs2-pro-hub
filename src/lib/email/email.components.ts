/**
 * FASE 2.5 — email building blocks.
 *
 * Table-based, inline-styled, dark-mode-first. No JavaScript, no web fonts, no
 * background image: what renders in Gmail, Outlook and Apple Mail is what the
 * player sees.
 */
import { EMAIL_THEME as T, escapeHtml } from "./email.theme";

export function heading(text: string, level: 1 | 2 = 1): string {
  const size = level === 1 ? "24px" : "18px";
  return `<h${level} style="margin:0 0 12px;font-family:${T.fontFamily};font-size:${size};line-height:1.3;font-weight:700;color:${T.textPrimary};">${escapeHtml(text)}</h${level}>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${T.fontFamily};font-size:15px;line-height:1.6;color:${T.textSecondary};">${escapeHtml(text)}</p>`;
}

export function muted(text: string): string {
  return `<p style="margin:0 0 8px;font-family:${T.fontFamily};font-size:12px;line-height:1.5;color:${T.textMuted};">${escapeHtml(text)}</p>`;
}

/** Bulletproof-ish button: a padded table cell, not a styled anchor. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
  <tr>
    <td align="center" bgcolor="${T.primary}" style="border-radius:${T.radiusSmall};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${T.fontFamily};font-size:15px;font-weight:700;color:${T.primaryContrast};text-decoration:none;border-radius:${T.radiusSmall};">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Fallback link, because a button can always fail to render or be blocked. */
export function fallbackLink(intro: string, href: string): string {
  return `${muted(intro)}<p style="margin:0 0 20px;font-family:${T.monoFamily};font-size:12px;line-height:1.5;word-break:break-all;color:${T.accent};">${escapeHtml(href)}</p>`;
}

/** Monospaced one-time code block. */
export function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px;">
  <tr>
    <td align="center" bgcolor="${T.surfaceAlt}" style="border:1px solid ${T.border};border-radius:${T.radiusSmall};padding:18px;font-family:${T.monoFamily};font-size:26px;letter-spacing:6px;font-weight:700;color:${T.primary};">${escapeHtml(code)}</td>
  </tr>
</table>`;
}

export type NoticeTone = "info" | "success" | "warning" | "danger";

export function notice(text: string, tone: NoticeTone = "info"): string {
  const color =
    tone === "success"
      ? T.primary
      : tone === "warning"
        ? T.warning
        : tone === "danger"
          ? T.danger
          : T.accent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr>
    <td bgcolor="${T.surfaceAlt}" style="border-left:3px solid ${color};border-radius:${T.radiusSmall};padding:14px 16px;font-family:${T.fontFamily};font-size:13px;line-height:1.6;color:${T.textSecondary};">${escapeHtml(text)}</td>
  </tr>
</table>`;
}

export function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${T.border};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;
}

/** Label / value list, used for security details (device, date, account). */
export function detailList(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      ({ label, value }) =>
        `<tr>
      <td style="padding:6px 12px 6px 0;font-family:${T.fontFamily};font-size:12px;color:${T.textMuted};white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-family:${T.monoFamily};font-size:12px;color:${T.textPrimary};">${escapeHtml(value)}</td>
    </tr>`,
    )
    .join("\n");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">${body}</table>`;
}
