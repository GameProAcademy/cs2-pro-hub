import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { identityActionFor, type IdentityActionInput } from "@/lib/pipeline/identityRecovery";
import { parserUpgradeRequired } from "@/lib/pipeline/parserUpgrade";

/**
 * D24 - production defect (2026-10-23, Mirage job 921b55cf): a job processed by parser
 * git:a5d8c425... was re-run IN PLACE after the R5.8.16 release (git:4716f894...). Its
 * immutable RAW evidence pins the old parser, so the new parse failed permanently with
 * PARSER_INVALID_RESPONSE "RAW manifest mismatch". An older-parser job must start a NEW
 * attempt instead, and nothing may requeue it in place.
 */
const OLD = "git:a5d8c425839e1e0e7e6f5506ae141bc85359726b";
const CURRENT = "git:4716f89429fd85f828e1e786d6520895d7bece53";

const MIRAGE_AFTER_D24: IdentityActionInput = {
  status: "failed",
  errorCode: "PARSER_INVALID_RESPONSE",
  matchId: "95186f3f-ec72-486d-9be0-f8e161737fae",
  retryCount: 7,
  demoAvailable: true,
  supersededByJobId: null,
  parserCurrent: false,
};

describe("parserUpgradeRequired", () => {
  it("is true only when a recorded revision differs from a pinned git revision", () => {
    expect(parserUpgradeRequired(OLD, CURRENT)).toBe(true);
    expect(parserUpgradeRequired(CURRENT, CURRENT)).toBe(false);
    expect(parserUpgradeRequired(null, CURRENT)).toBe(false);
    expect(parserUpgradeRequired(OLD, null)).toBe(false);
    expect(parserUpgradeRequired(OLD, "not-a-revision")).toBe(false);
  });
});

describe("identity action for older-parser jobs", () => {
  it("the failed Mirage job (permanent RAW manifest mismatch) offers reprocessing", () => {
    expect(identityActionFor(MIRAGE_AFTER_D24)).toBe("reprocess_current_parser");
  });

  it("a processed older-parser job offers reprocessing, never the in-place identity re-run", () => {
    expect(identityActionFor({ ...MIRAGE_AFTER_D24, status: "processed", errorCode: null })).toBe(
      "reprocess_current_parser",
    );
  });

  it("expired file -> re-upload; superseded -> nothing; other permanent refusals -> nothing", () => {
    expect(identityActionFor({ ...MIRAGE_AFTER_D24, demoAvailable: false })).toBe(
      "reupload_required",
    );
    expect(identityActionFor({ ...MIRAGE_AFTER_D24, supersededByJobId: "x" })).toBeNull();
    expect(
      identityActionFor({ ...MIRAGE_AFTER_D24, errorCode: "CANONICAL_MATCH_QUARANTINED" }),
    ).toBeNull();
    expect(identityActionFor({ ...MIRAGE_AFTER_D24, matchId: null })).toBeNull();
  });

  it("in-flight jobs offer nothing whatever their parser", () => {
    for (const status of ["pending", "processing", "cancel_requested", "blocked_raw_audit"])
      expect(identityActionFor({ ...MIRAGE_AFTER_D24, status })).toBeNull();
  });

  it("current-parser jobs keep the existing behaviour", () => {
    const current = {
      ...MIRAGE_AFTER_D24,
      parserCurrent: true,
      errorCode: "CANONICAL_PERSISTENCE_ERROR",
    };
    expect(identityActionFor(current)).toBe("select_and_retry");
    expect(identityActionFor({ ...current, status: "processed", errorCode: null })).toBe(
      "identity",
    );
  });
});

describe("wiring: nothing requeues an older-parser job in place", () => {
  const identity = readFileSync(resolve("src/lib/pipeline-identity.functions.ts"), "utf8");
  const pipeline = readFileSync(resolve("src/lib/pipeline.functions.ts"), "utf8");
  const panel = readFileSync(resolve("src/components/pipeline/DemoIngestPanel.tsx"), "utf8");
  const migration = readFileSync(
    resolve("supabase/migrations/20261023080000_d24_parser_upgrade_attempt.sql"),
    "utf8",
  );

  it("declareDemoPlayer refuses before the requeue RPC", () => {
    const start = identity.indexOf("export const declareDemoPlayer");
    const guard = identity.indexOf("PARSER_UPGRADE_REPROCESS_REQUIRED", start);
    const rpc = identity.indexOf('"requeue_demo_job_after_attachment"', start);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(rpc);
  });

  it("retryMyDemoJob refuses before retry_demo_job", () => {
    const start = pipeline.indexOf("export const retryMyDemoJob");
    const guard = pipeline.indexOf("PARSER_UPGRADE_REPROCESS_REQUIRED", start);
    const rpc = pipeline.indexOf('"retry_demo_job"', start);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(rpc);
  });

  it("reprocessing reserves a new attempt, copies the file and enqueues it", () => {
    const start = pipeline.indexOf("export const reprocessDemoWithCurrentParser");
    const body = pipeline.slice(start, pipeline.indexOf("export const cancelMyDemoJob"));
    const reserve = body.indexOf('"reserve_demo_parser_upgrade_attempt"');
    const copy = body.indexOf("copyDemoForNewAttempt(");
    const enqueue = body.indexOf('"enqueue_demo_job"');
    expect(reserve).toBeGreaterThan(0);
    expect(copy).toBeGreaterThan(reserve);
    expect(enqueue).toBeGreaterThan(copy);
    expect(body).toContain("assertDemoContentNotQuarantined");
    expect(body).not.toContain("retry_demo_job");
    expect(body).not.toContain("requeue_demo_job_after_attachment");
  });

  it("a re-upload of an older-parser processed demo starts the new attempt", () => {
    const start = pipeline.indexOf("export const createDemoUpload");
    const body = pipeline.slice(start, pipeline.indexOf("export const enqueueDemoJob"));
    expect(body).toContain('result["duplicate_status"] === "processed"');
    expect(body).toContain('"reserve_demo_parser_upgrade_attempt"');
  });

  it("the panel offers reprocessing and hides the in-place retry for older-parser jobs", () => {
    expect(panel).toContain('identityActionFor(job) === "reprocess_current_parser"');
    expect(panel).toContain("job.parserCurrent !== false &&");
  });

  it("the database function is service-role only and keeps the prior attempt", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.reserve_demo_parser_upgrade_attempt\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toContain("'parser_upgrade'");
    expect(migration).not.toMatch(/UPDATE public\.demo_jobs/);
    expect(migration).not.toMatch(/DELETE FROM/);
    expect(migration).not.toMatch(/raw_evidence_artifacts\s+SET/i);
  });
});
