/**
 * PR4 — "Reportar problema" (pure part: no I/O, no secrets).
 *
 * The server function builds the report ONLY from the job row it reads under the player's own
 * session (RLS) and from the shared guidance classifier; nothing the browser sends is trusted
 * except an optional note, which is sanitized and size-limited here.
 *
 * The report never contains: service role key, API keys, tokens, passwords, auth headers,
 * cookies, .dem content, RAW evidence, AI Coach PLAYER_FACTS, or personal data that support
 * does not need. It carries job/attempt references, the classified category, error code,
 * stage, parser revision (= worker build), locale, page and the internal user id.
 */
import type { DemoGuidance } from "@/lib/pipeline/errorGuidance";

/** Fixed support inbox. The browser never chooses the recipient. */
export const SUPPORT_REPORT_RECIPIENT = "bug@gamepro.academy";
export const MAX_REPORT_DETAILS = 1000;
export const MAX_REPORTS_PER_HOUR = 5;
export const PROTOCOL_PATTERN = /^GP-[0-9A-Z]{6}$/;

const REDACTED = "[removido]";

/**
 * Removes secrets and unnecessary personal data from a player's free-text note, strips
 * control characters and limits its size. Returns null for an empty note.
 */
export function sanitizeReportDetails(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let text = input
    // control characters except newline and tab
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n");
  const patterns: RegExp[] = [
    // JWTs (Supabase access/service tokens)
    /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    // Authorization / bearer values
    /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    // key=value secrets (api_key=…, token: …, password=…, secret=…, cookie: …)
    /\b(?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|senha|cookie|authorization|service[_-]?role(?:[_-]?key)?)\b\s*[:=]\s*\S+/gi,
    // provider key shapes
    /\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{12,}\b/g,
    /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    // e-mail addresses (support already knows the account by its internal id)
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    // long opaque tokens (hex/base64) of 32+ chars
    /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
    /\b[a-f0-9]{32,}\b/gi,
  ];
  for (const pattern of patterns) text = text.replace(pattern, REDACTED);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  return text.length > MAX_REPORT_DETAILS ? text.slice(0, MAX_REPORT_DETAILS) : text;
}

/** Same occurrence = same job state; the attempt and retry are added by the database. */
export function occurrenceKeyFor(guidance: DemoGuidance): string {
  const ref = guidance.technicalReference;
  return [guidance.category, ref.errorCode ?? "-", ref.status].join("|").slice(0, 200);
}

/** Only a same-origin path, never a query string or fragment (they can carry tokens). */
export function sanitizePage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const path = input.split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path.replace(/[^A-Za-z0-9/_.-]/g, "").slice(0, 200) || null;
}

export interface ProblemReportPayload {
  protocol: string;
  createdAt: string;
  userId: string;
  jobId: string;
  attemptNumber: number;
  retryCount: number;
  fileName: string | null;
  jobStatus: string;
  stage: string | null;
  category: string;
  severity: string;
  errorCode: string | null;
  recommendedAction: string;
  parserRevision: string | null;
  locale: string;
  page: string | null;
  appVersion: string | null;
  details: string | null;
  /**
   * Support-only technical diagnostics (e.g. the RAW artifact of a blocked audit, so the team
   * can run `scripts/parser_field_catalog.py diagnose`). Never shown to the player.
   */
  diagnostics?: Array<[string, string]>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Support email (pt-BR for the team; the player's locale is reported as a field). */
export function buildProblemReportEmail(p: ProblemReportPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `[${p.protocol}] Problema reportado — ${p.category}${p.errorCode ? ` (${p.errorCode})` : ""}`;
  const rows: Array<[string, string]> = [
    ["Protocolo", p.protocol],
    ["Data/hora (UTC)", p.createdAt],
    ["Usuário (id interno)", p.userId],
    ["Job", p.jobId],
    ["Tentativa", `${p.attemptNumber} (reexecuções: ${p.retryCount})`],
    ["Arquivo", p.fileName ?? "—"],
    ["Status do job", p.jobStatus],
    ["Etapa", p.stage ?? "—"],
    ["Categoria", `${p.category} (${p.severity})`],
    ["Código", p.errorCode ?? "—"],
    ["Ação recomendada ao jogador", p.recommendedAction],
    ["Revisão do parser / build do worker", p.parserRevision ?? "—"],
    ["Idioma do usuário", p.locale],
    ["Página", p.page ?? "—"],
    ["Versão do app", p.appVersion ?? "—"],
    ...(p.diagnostics ?? []),
  ];
  const note = p.details ?? "(sem detalhes adicionais)";
  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nDetalhes do jogador (sanitizados):\n${note}\n`;
  const html =
    `<h2 style="font-family:sans-serif">Problema reportado ${escapeHtml(p.protocol)}</h2>` +
    `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</td>` +
          `<td style="padding:4px 0"><code>${escapeHtml(v)}</code></td></tr>`,
      )
      .join("") +
    `</table><h3 style="font-family:sans-serif">Detalhes do jogador (sanitizados)</h3>` +
    `<pre style="white-space:pre-wrap;font-size:13px">${escapeHtml(note)}</pre>`;
  return { subject, text, html };
}
