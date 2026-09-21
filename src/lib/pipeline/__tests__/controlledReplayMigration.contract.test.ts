import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260921080334_7925a88b-a173-4f6a-b03c-6af5b29cea11.sql"),
  "utf8",
);

describe("G.6-R.3 controlled replay database contract", () => {
  it("accepts the dedicated reason while constraining it to attempt 9", () => {
    expect(migration.match(/'g6r-real-demo-replay'/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration.match(/attempt_number = 9/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("uploads_controlled_replay_attempt_check");
    expect(migration).toContain("demo_jobs_controlled_replay_attempt_check");
  });

  it("serializes reservation before validating and creating attempt 9", () => {
    const reservation = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.reserve_controlled_demo_replay_attempt_9"),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.finalize_controlled_demo_replay_attempt_9"),
    );
    expect(reservation).toContain("pg_advisory_xact_lock");
    expect(reservation).toContain("ATTEMPT_10_FORBIDDEN");
    expect(reservation).toContain("DUPLICATE_ATTEMPT_9");
    expect(reservation).toContain("ATTEMPT_9_INCOMPATIBLE");
    expect(reservation).not.toContain("max(attempt_number)");
  });

  it("fails closed on provenance and atomically couples enqueue with audit", () => {
    expect(migration).toContain("PARSER_PROVENANCE_UNVERIFIED");
    const finalization = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.finalize_controlled_demo_replay_attempt_9"),
    );
    expect(finalization).toContain("public.enqueue_demo_job(_upload_id, _user_id)");
    expect(finalization).toContain("INSERT INTO public.admin_audit_logs");
    expect(finalization).toContain("ATTEMPT_9_ENQUEUE_MISMATCH");
  });

  it("exposes replay operations only to the service role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.reserve_controlled_demo_replay_attempt_9",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_controlled_demo_replay_attempt_9",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.finalize_controlled_demo_replay_attempt_9",
    );
  });
});