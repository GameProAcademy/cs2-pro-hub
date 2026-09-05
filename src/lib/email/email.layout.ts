/**
 * FASE 2.5 — GamePro email layout.
 *
 * One shell for every message: dark background, centred card, wordmark header,
 * legal/contextual footer, preheader text for the inbox preview.
 */
import { EMAIL_THEME as T, escapeHtml } from "./email.theme";

export interface EmailLayoutInput {
  /** Inbox subject line (not rendered in the body). */
  subject: string;
  /** Short inbox preview line. */
  preheader: string;
  /** Pre-rendered body HTML (built with email.components). */
  body: string;
  /** Footer note, e.g. "you received this because…". */
  footerNote: string;
  /** BCP-47 tag for the `lang` attribute. */
  lang?: string;
}

export function renderEmailLayout({
  subject,
  preheader,
  body,
  footerNote,
  lang = "pt-BR",
}: EmailLayoutInput): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${T.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${T.background};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${T.maxWidth};">
        <tr>
          <td style="padding:0 4px 18px;font-family:${T.fontFamily};font-size:18px;font-weight:800;letter-spacing:1px;color:${T.textPrimary};">
            <span style="color:${T.primary};">GAME</span>PRO
            <span style="display:block;margin-top:4px;font-size:11px;font-weight:600;letter-spacing:2px;color:${T.textMuted};">CS2 PRO AI COACH</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="${T.surface}" style="border:1px solid ${T.border};border-radius:${T.radius};padding:28px 26px;">
${body}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 6px 0;font-family:${T.fontFamily};font-size:11px;line-height:1.6;color:${T.textMuted};">
            ${escapeHtml(footerNote)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
