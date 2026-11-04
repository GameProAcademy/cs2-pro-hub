/**
 * PR3 — centralized demo guidance. One classifier for the upload modal and the history card:
 * every category is mapped, retry is offered only where the existing server rule allows it,
 * gates/reviews never offer retry, copy exists in the 5 locales, and modal and card render
 * the same guidance for the same job.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoGuidancePanel } from "@/components/pipeline/DemoGuidancePanel";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { guidancePtBR } from "@/i18n/locales/guidance/pt-BR";
import { PIPELINE_ERROR_CODES, isPermanentError } from "@/lib/pipeline/errors";
import {
  STOPPED_GUIDANCE,
  classifyDemoJob,
  guidanceCopyKeys,
  retryAllowedFor,
  type GuidanceCategory,
  type GuidanceJob,
} from "@/lib/pipeline/errorGuidance";
import { identityActionFor } from "@/lib/pipeline/identityRecovery";

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];

function job(over: Partial<GuidanceJob> = {}): GuidanceJob {
  return {
    status: "failed",
    stage: "parsing",
    errorCode: null,
    retryCount: 0,
    maxRetries: 3,
    matchId: null,
    demoAvailable: true,
    parserCurrent: true,
    supersededByJobId: null,
    partialParse: false,
    attachmentState: "unattached",
    attachmentConfirmationStatus: undefined,
    ...over,
  };
}

/** The card's original retry-button condition, copied verbatim from DemoIngestPanel. */
function cardRetryRule(j: GuidanceJob): boolean {
  const code = j.errorCode;
  const permanent =
    code !== null &&
    (PIPELINE_ERROR_CODES as readonly string[]).includes(code) &&
    isPermanentError(code as (typeof PIPELINE_ERROR_CODES)[number]);
  return (
    j.status === "failed" &&
    identityActionFor(j) !== "select_and_retry" &&
    j.parserCurrent !== false &&
    !permanent &&
    j.retryCount < j.maxRetries
  );
}

const ALL_CATEGORIES: GuidanceCategory[] = [
  "processing",
  "completed",
  "partial",
  "identity_pending",
  "invalid_file",
  "incompatible_format",
  "insufficient_sample",
  "temporary_failure",
  "service_issue",
  "raw_audit_review",
  "canonical_review",
  "quarantined",
  "older_parser",
  "file_expired",
  "cancelled",
  "internal_error",
  "unknown",
];

describe("classifyDemoJob — categories", () => {
  it.each([
    ["CORRUPTED_DEMO", "invalid_file"],
    ["DEMO_EMPTY", "invalid_file"],
    ["DEMO_TOO_SMALL", "invalid_file"],
    ["UNSUPPORTED_DEMO", "invalid_file"],
    ["INVALID_DEMO_FORMAT", "incompatible_format"],
    ["DEMO_TOO_LARGE", "incompatible_format"],
    ["DEMO_INSUFFICIENT_SAMPLE", "insufficient_sample"],
    ["RAW_AUDIT_BLOCKED", "raw_audit_review"],
    ["CANONICAL_RESOLUTION_CONFLICT", "canonical_review"],
    ["VALIDATION_ERROR", "canonical_review"],
    ["PLAYER_IDENTITY_UNRESOLVED", "canonical_review"],
    ["CANONICAL_MATCH_QUARANTINED", "quarantined"],
    ["PARSER_CONFIG_ERROR", "service_issue"],
    ["PARSER_IDENTITY_MISMATCH", "service_issue"],
    ["PARSER_PAYLOAD_TOO_LARGE", "service_issue"],
    ["PARSER_TIMEOUT", "temporary_failure"],
    ["PARSER_UNAVAILABLE", "temporary_failure"],
    ["JOB_STALE", "temporary_failure"],
    ["STORAGE_ERROR", "temporary_failure"],
    ["PROCESSING_ERROR", "internal_error"],
    ["SOMETHING_NEW", "internal_error"],
  ] as const)("%s → %s", (errorCode, category) => {
    expect(classifyDemoJob(job({ errorCode })).category).toBe(category);
  });

  it("maps every pipeline error code to a stopped category", () => {
    for (const errorCode of PIPELINE_ERROR_CODES) {
      const g = classifyDemoJob(job({ errorCode }));
      expect(STOPPED_GUIDANCE.has(g.category), errorCode).toBe(true);
    }
  });

  it("in-flight, cancelled, blocked and unknown statuses", () => {
    for (const status of ["pending", "processing", "cancel_requested"]) {
      const g = classifyDemoJob(job({ status }));
      expect(g.category).toBe("processing");
      expect(g.recommendedAction).toBe("wait");
      expect(g.retryAllowed).toBe(false);
    }
    expect(classifyDemoJob(job({ status: "cancelled" })).category).toBe("cancelled");
    const blocked = classifyDemoJob(job({ status: "blocked_raw_audit" }));
    expect(blocked.category).toBe("raw_audit_review");
    expect(blocked.severity).toBe("review");
    const unknown = classifyDemoJob(job({ status: "teleported" }));
    expect(unknown.category).toBe("unknown");
    expect(unknown.severity).not.toBe("success");
  });

  it("processed: identity pending until confirmed; completed or partial only when confirmed", () => {
    const base = { status: "processed", matchId: "m1", stage: "done" };
    expect(classifyDemoJob(job(base)).category).toBe("identity_pending");
    expect(
      classifyDemoJob(
        job({
          ...base,
          attachmentState: "attached",
          attachmentConfirmationStatus: "pending_confirmation",
        }),
      ).category,
    ).toBe("identity_pending");
    for (const status of ["user_confirmed", "manual_selected"]) {
      const done = { ...base, attachmentState: "attached", attachmentConfirmationStatus: status };
      expect(classifyDemoJob(job(done)).category).toBe("completed");
      expect(classifyDemoJob(job({ ...done, partialParse: true })).category).toBe("partial");
    }
  });

  it("older parser and expired file use the existing recovery actions", () => {
    const older = classifyDemoJob(
      job({ status: "processed", matchId: "m1", parserCurrent: false }),
    );
    expect(older.category).toBe("older_parser");
    expect(older.recommendedAction).toBe("reprocess");
    const expired = classifyDemoJob(
      job({ matchId: "m1", demoAvailable: false, errorCode: "PARSER_TIMEOUT" }),
    );
    expect(expired.category).toBe("file_expired");
    expect(expired.recommendedAction).toBe("reupload");
    expect(expired.retryAllowed).toBe(false);
  });

  it("every category has copy keys", () => {
    for (const category of ALL_CATEGORIES) {
      const keys = guidanceCopyKeys(category);
      for (const key of [keys.title, keys.body, keys.todo]) {
        expect(key in guidancePtBR, key).toBe(true);
      }
    }
  });
});

describe("retry is offered only where the server rule allows it", () => {
  const codes = [...PIPELINE_ERROR_CODES, null, "SOMETHING_NEW"];

  it("retryAllowedFor equals the card's existing retry-button rule", () => {
    for (const errorCode of codes) {
      for (const retryCount of [0, 2, 3]) {
        for (const parserCurrent of [true, false]) {
          for (const matchId of [null, "m1"]) {
            const j = job({ errorCode, retryCount, parserCurrent, matchId });
            expect(retryAllowedFor(j, identityActionFor(j)), `${errorCode}/${retryCount}`).toBe(
              cardRetryRule(j),
            );
          }
        }
      }
    }
  });

  it("guidance.retryAllowed is never true where the card rule is false", () => {
    for (const errorCode of codes) {
      for (const status of ["failed", "processed", "blocked_raw_audit", "pending", "cancelled"]) {
        const j = job({ errorCode, status });
        if (classifyDemoJob(j).retryAllowed) expect(cardRetryRule(j)).toBe(true);
      }
    }
  });

  it("never offers retry for gates, reviews, definitive failures or unknown states", () => {
    const never: GuidanceCategory[] = [
      "invalid_file",
      "incompatible_format",
      "insufficient_sample",
      "service_issue",
      "raw_audit_review",
      "canonical_review",
      "quarantined",
      "unknown",
      "completed",
      "partial",
      "cancelled",
    ];
    for (const errorCode of codes) {
      for (const status of ["failed", "blocked_raw_audit", "teleported", "cancelled"]) {
        const g = classifyDemoJob(job({ errorCode, status }));
        if (never.includes(g.category))
          expect(g.retryAllowed, `${status}/${errorCode}`).toBe(false);
      }
    }
  });

  it("an exhausted retry budget turns a temporary failure into a report", () => {
    const g = classifyDemoJob(job({ errorCode: "PARSER_TIMEOUT", retryCount: 3 }));
    expect(g.category).toBe("temporary_failure");
    expect(g.retryAllowed).toBe(false);
    expect(g.recommendedAction).toBe("report");
    expect(g.requiresSupport).toBe(true);
  });

  it("reviews are amber (review severity), never red", () => {
    for (const errorCode of [
      "RAW_AUDIT_BLOCKED",
      "CANONICAL_RESOLUTION_CONFLICT",
      "CANONICAL_MATCH_QUARANTINED",
    ]) {
      expect(classifyDemoJob(job({ errorCode })).severity).toBe("review");
    }
    expect(classifyDemoJob(job({ status: "blocked_raw_audit" })).severity).toBe("review");
  });

  it("the technical reference carries only status, stage and code", () => {
    const g = classifyDemoJob(job({ errorCode: "PARSER_TIMEOUT", stage: "parsing" }));
    expect(g.technicalReference).toEqual({
      status: "failed",
      stage: "parsing",
      errorCode: "PARSER_TIMEOUT",
    });
  });
});

describe("copy in every locale", () => {
  it("all guidance keys exist and are non-empty in the 5 locales", () => {
    for (const locale of LOCALES) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const key of Object.keys(guidancePtBR)) {
        expect(typeof dict[key], `${locale}:${key}`).toBe("string");
        expect(dict[key]!.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("RAW audit copy tells the player not to resend the same demo", () => {
    expect(guidancePtBR["guidance.raw_audit_review.todo"]).toContain("Não é necessário enviar");
    expect(guidancePtBR["guidance.whatToDo"]).toBe("O que você deve fazer?");
  });
});

function render(node: React.ReactNode, locale: Locale = "pt-BR") {
  return renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

describe("DemoGuidancePanel", () => {
  it("shows retry only when allowed and a handler exists", () => {
    const allowed = classifyDemoJob(job({ errorCode: "PARSER_TIMEOUT" }));
    expect(allowed.retryAllowed).toBe(true);
    const html = render(<DemoGuidancePanel guidance={allowed} onRetry={() => {}} />);
    expect(html).toContain("Tentar novamente");
    expect(html).toContain('data-retry-allowed="true"');

    const blocked = classifyDemoJob(job({ status: "blocked_raw_audit" }));
    const blockedHtml = render(<DemoGuidancePanel guidance={blocked} onRetry={() => {}} />);
    expect(blockedHtml).not.toContain("Tentar novamente");
    expect(blockedHtml).toContain("O que você deve fazer?");
    expect(blockedHtml).toContain("border-warning");
    expect(blockedHtml).not.toContain("border-destructive");
  });

  it("offers another demo for an unreadable file", () => {
    const g = classifyDemoJob(job({ errorCode: "DEMO_EMPTY" }));
    const html = render(<DemoGuidancePanel guidance={g} onChooseAnother={() => {}} />);
    expect(html).toContain("Enviar outra demo");
    expect(html).toContain("border-destructive");
  });

  it("renders in every locale without falling back to keys", () => {
    const g = classifyDemoJob(job({ errorCode: "PARSER_TIMEOUT" }));
    for (const locale of LOCALES) {
      const html = render(<DemoGuidancePanel guidance={g} />, locale);
      expect(html).not.toContain("guidance.");
    }
  });
});

describe("modal and card use the same classifier", () => {
  const read = (p: string) => readFileSync(resolve(p), "utf8");
  it("both containers classify with classifyDemoJob and render DemoGuidancePanel", () => {
    const card = read("src/components/pipeline/DemoIngestPanel.tsx");
    const modal = read("src/components/pipeline/DemoFlowModal.tsx");
    const view = read("src/components/pipeline/DemoFlowView.tsx");
    expect(card).toContain("classifyDemoJob(job)");
    expect(card).toContain("<DemoGuidancePanel");
    expect(card).toContain("classifyDemoJob(job).retryAllowed");
    expect(modal).toContain("classifyDemoJob(job)");
    expect(view).toContain("<DemoGuidancePanel");
  });
});
