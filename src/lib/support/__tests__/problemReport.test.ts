/**
 * PR4 — "Reportar problema": sanitization, payload, honesty of the UI outcome, i18n and the
 * server/database contract (auth, ownership, idempotency, rate limit, no mailto, no secrets).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { guidancePtBR } from "@/i18n/locales/guidance/pt-BR";
import { classifyDemoJob } from "@/lib/pipeline/errorGuidance";
import {
  MAX_REPORT_DETAILS,
  PROTOCOL_PATTERN,
  SUPPORT_REPORT_RECIPIENT,
  buildProblemReportEmail,
  occurrenceKeyFor,
  sanitizePage,
  sanitizeReportDetails,
  type ProblemReportPayload,
} from "@/lib/support/problemReport";
import { reportErrorKey, reportViewFor } from "@/lib/support/reportView";

const read = (p: string) => readFileSync(resolve(p), "utf8");

describe("sanitizeReportDetails", () => {
  it("removes tokens, keys, credentials and e-mail addresses", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlX3NpZ25hdHVyZQ";
    const dirty = [
      `my key ${jwt}`,
      "Authorization: Bearer abcdefghijklmnop12345",
      "api_key=sk-live-ABCDEFGHIJKLMNOPQRST",
      "password: hunter2hunter2",
      "senha=minhasenha123",
      "cookie: sb-access-token=xyz123456789",
      "service_role_key=whatever123456",
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWX",
      "AKIAABCDEFGHIJKLMNOP",
      "contact me at someone@example.com",
      "hash 0123456789abcdef0123456789abcdef0123",
    ].join("\n");
    const clean = sanitizeReportDetails(dirty) ?? "";
    for (const secret of [
      jwt,
      "abcdefghijklmnop12345",
      "sk-live-ABCDEFGHIJKLMNOPQRST",
      "hunter2hunter2",
      "minhasenha123",
      "xyz123456789",
      "whatever123456",
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWX",
      "AKIAABCDEFGHIJKLMNOP",
      "someone@example.com",
      "0123456789abcdef0123456789abcdef0123",
    ]) {
      expect(clean, secret).not.toContain(secret);
    }
    expect(clean).toContain("[removido]");
  });

  it("keeps ordinary text, strips control characters and limits size", () => {
    expect(sanitizeReportDetails("A demo travou no round 12\u0000\u0007")).toBe(
      "A demo travou no round 12",
    );
    expect(sanitizeReportDetails("   ")).toBeNull();
    expect(sanitizeReportDetails(42)).toBeNull();
    expect(sanitizeReportDetails("x ".repeat(5000))!.length).toBeLessThanOrEqual(
      MAX_REPORT_DETAILS,
    );
  });

  it("page keeps only a same-origin path, never query or fragment", () => {
    expect(sanitizePage("/upload?token=abc#x")).toBe("/upload");
    expect(sanitizePage("https://evil.example/x")).toBeNull();
    expect(sanitizePage("//evil.example")).toBeNull();
    expect(sanitizePage(undefined)).toBeNull();
  });
});

const payload: ProblemReportPayload = {
  protocol: "GP-7K2Q9M",
  createdAt: "2026-11-04T12:00:00.000Z",
  userId: "00000000-0000-0000-0000-00000000000a",
  jobId: "10000000-0000-0000-0000-000000000001",
  attemptNumber: 2,
  retryCount: 1,
  fileName: "match<script>.dem",
  jobStatus: "failed",
  stage: "parsing",
  category: "internal_error",
  severity: "error",
  errorCode: "PROCESSING_ERROR",
  recommendedAction: "report",
  parserRevision: "git:c764f858",
  locale: "fr",
  page: "/upload",
  appVersion: null,
  details: "travou",
};

describe("support email", () => {
  it("goes to the fixed support inbox", () => {
    expect(SUPPORT_REPORT_RECIPIENT).toBe("bug@gamepro.academy");
  });

  it("carries the required references and escapes HTML", () => {
    const email = buildProblemReportEmail(payload);
    for (const value of [
      "GP-7K2Q9M",
      payload.jobId,
      payload.userId,
      "PROCESSING_ERROR",
      "parsing",
      "internal_error",
      "git:c764f858",
      "fr",
      "/upload",
      "2026-11-04T12:00:00.000Z",
    ]) {
      expect(email.text, value).toContain(value);
    }
    expect(email.subject).toContain("GP-7K2Q9M");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("the protocol format is GP-XXXXXX", () => {
    expect(PROTOCOL_PATTERN.test("GP-7K2Q9M")).toBe(true);
    expect(PROTOCOL_PATTERN.test("GP-7k2q9m")).toBe(false);
    expect(PROTOCOL_PATTERN.test("GP-12345")).toBe(false);
  });

  it("the occurrence key is derived from the classified job state", () => {
    const g = classifyDemoJob({
      status: "failed",
      stage: "parsing",
      errorCode: "PROCESSING_ERROR",
      retryCount: 0,
      maxRetries: 3,
      matchId: null,
      demoAvailable: true,
      parserCurrent: true,
      supersededByJobId: null,
    });
    expect(occurrenceKeyFor(g)).toBe("internal_error|PROCESSING_ERROR|failed");
  });
});

describe("the UI never claims a send that did not happen", () => {
  it("sent only when the provider accepted", () => {
    expect(reportViewFor({ protocol: "GP-AAAAAA", state: "created", email: "sent" }).kind).toBe(
      "sent",
    );
    expect(reportViewFor({ protocol: "GP-AAAAAA", state: "created", email: "not_sent" }).kind).toBe(
      "recorded",
    );
    expect(
      reportViewFor({ protocol: "GP-AAAAAA", state: "existing", email: "not_sent" }).kind,
    ).toBe("recorded");
  });

  it("maps errors to honest messages", () => {
    expect(reportErrorKey(new Error("REPORT_RATE_LIMITED"))).toBe("report.rateLimited");
    expect(reportErrorKey(new Error("JOB_NOT_FOUND"))).toBe("report.notFound");
    expect(reportErrorKey(new Error("anything"))).toBe("report.unavailable");
  });

  it("uses the exact success and failure messages", () => {
    expect(guidancePtBR["report.sent"]).toBe(
      "Problema reportado com sucesso. Nossa equipe recebeu as informações necessárias para investigar.",
    );
    expect(guidancePtBR["report.recorded"]).toBe(
      "Não conseguimos enviar seu relatório automaticamente. Seu problema foi registrado localmente no sistema e poderá ser enviado novamente.",
    );
    expect(guidancePtBR["report.detailsLabel"]).toBe("Conte mais detalhes (opcional)");
  });

  it("report copy exists in the 5 locales", () => {
    const locales: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
    for (const locale of locales) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const key of Object.keys(guidancePtBR).filter((k) => k.startsWith("report."))) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("server and database contract", () => {
  const fn = read("src/lib/pipeline.functions.ts");
  const start = fn.indexOf("export const reportDemoProblem");
  const handler = fn.slice(start);
  const sql = read("supabase/migrations/20261104090000_demo_problem_reports.sql");

  it("is authenticated, reads the job under the player's session and sends from the backend", () => {
    expect(start).toBeGreaterThan(0);
    expect(handler).toContain(".middleware([requireSupabaseAuth])");
    expect(handler).toContain('await context.supabase\n      .from("demo_jobs")');
    expect(handler).toContain('"claim_demo_problem_report"');
    expect(handler).toContain("to: SUPPORT_REPORT_RECIPIENT");
    expect(handler).toContain('kind: "support_report"');
    expect(handler).toContain("idempotencyKey: `support_report:${reportId}`");
    // Category/code/stage come from the job row, never from the browser.
    expect(handler).toContain("classifyDemoJob(view)");
    expect(handler).not.toMatch(/data\.(category|errorCode|stage|to|recipient)\b/);
  });

  it("never uses mailto: and never ships an email credential to the browser", () => {
    const files = walk(resolve("src")).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"),
    );
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/mailto:/i);
    }
    const ui = read("src/components/pipeline/ReportProblem.tsx");
    expect(ui).not.toMatch(/HOSTINGER|EMAIL_|process\.env|import\.meta\.env/);
  });

  it("the report payload excludes forbidden data", () => {
    const pure = read("src/lib/support/problemReport.ts");
    for (const forbidden of ["PLAYER_FACTS", "raw_evidence", "service_role", "storage_path"]) {
      expect(handler, forbidden).not.toContain(forbidden);
      expect(pure.replace(/^ \*.*$/gm, ""), forbidden).not.toContain(forbidden);
    }
  });

  it("migration: RLS owner-read, server-only writes, unique protocol, idempotency, rate limit", () => {
    expect(sql).toContain("ALTER TABLE public.demo_problem_reports ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("USING (user_id = auth.uid())");
    expect(sql).toContain("REVOKE ALL ON public.demo_problem_reports FROM anon, authenticated");
    expect(sql).toContain("CHECK (protocol ~ '^GP-[0-9A-Z]{6}$')");
    expect(sql).toContain("UNIQUE (protocol)");
    expect(sql).toContain("UNIQUE (user_id, job_id, attempt_number, retry_count, occurrence_key)");
    expect(sql).toContain("v_job.user_id IS DISTINCT FROM _user_id");
    expect(sql).toContain("'rate_limited'");
    expect(sql).toContain("char_length(details) <= 1000");
    expect(sql).toMatch(/FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE[\s\S]*TO service_role;/);
  });
});
