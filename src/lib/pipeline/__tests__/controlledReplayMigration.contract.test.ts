import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260921080334_7925a88b-a173-4f6a-b03c-6af5b29cea11.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  resolve("supabase/migrations/20260921082049_c2b2d22d-f840-4296-86b8-8cfdc9ed5295.sql"),
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

describe("G.6-R.4 parser attestation and replay binding", () => {
  it("pins the repository, deployment, branch, parser identity, and critical source hashes", () => {
    expect(hardeningMigration).toContain("GameProAcademy/cs2-pro-hub");
    expect(hardeningMigration).toContain("infra/cs2-demo-parser-worker-v8");
    expect(hardeningMigration).toContain("6330c8c4-a410-45db-a364-4eb47702c2fc");
    expect(hardeningMigration).toContain("GITHUB_COMMIT_RAILWAY_DEPLOYMENT_LIVE_VERSION_V1");
    expect(hardeningMigration).toContain("services/cs2-demo-parser/parser.py");
    expect(hardeningMigration).toContain("services/cs2-demo-parser/settings.py");
  });

  it("recomputes a canonical SHA-256 attestation and anchors freshness to server time", () => {
    expect(hardeningMigration).toContain("parser_attestation_canonical_payload");
    expect(hardeningMigration).toContain("extensions.digest");
    expect(hardeningMigration).toContain("parser_attestation_digest(_attestation)");
    expect(hardeningMigration).toContain("_p.created_at < now() - interval '24 hours'");
    expect(hardeningMigration).toContain("verification_timestamp <= created_at");
  });

  it("requires structured source, deployment, and live runtime proof", () => {
    expect(hardeningMigration).toContain("branch_contains_commit");
    expect(hardeningMigration).toContain("RAILWAY_API");
    expect(hardeningMigration).toContain("custom_domain_identity_match");
    expect(hardeningMigration).toContain("railway_domain_identity_match");
    expect(hardeningMigration).toContain("parse_endpoint_binding_verified");
  });

  it("binds reservation, verified copy, enqueue, and audit atomically", () => {
    expect(hardeningMigration).toContain("controlled_replay_reservation_id");
    expect(hardeningMigration).toContain("DEMO_CONTROLLED_REPLAY_RESERVED");
    expect(hardeningMigration).toContain("ATTEMPT_9_RESERVATION_MISMATCH");
    expect(hardeningMigration).toContain("controlled_replay_copy_status = 'VERIFIED'");
    expect(hardeningMigration).toContain("DEMO_CONTROLLED_REPLAY_CREATED");
  });

  it("keeps attestation and controlled replay helpers service-role-only", () => {
    expect(hardeningMigration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_verified_parser_provenance(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(hardeningMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.reserve_controlled_demo_replay_attempt_9",
    );
    expect(hardeningMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.finalize_controlled_demo_replay_attempt_9",
    );
  });
});