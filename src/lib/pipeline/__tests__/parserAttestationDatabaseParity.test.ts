import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import { APPROVED_ATTESTATION_WORKFLOW_SHA } from "@/lib/parserAttestationWorkflowRegistry";

const legacyMigration = readFileSync(
  resolve("supabase/migrations/20260929103000_reconcile_r58_live_attestation_pins.sql"),
  "utf8",
);
const r582Migration = readFileSync(
  resolve("supabase/migrations/20261005090000_r58_2_live_deployment_pin_reconciliation.sql"),
  "utf8",
);
// The migration that pins the managed recorder to the current runtime (R5.8.10).
const migration = readFileSync(
  resolve("supabase/migrations/20261014210000_r5_8_10_repin_attestation_recorder.sql"),
  "utf8",
);
// The previous link of the chain stays committed with its own pins.
const r589Migration = readFileSync(
  resolve("supabase/migrations/20261013130000_r5_8_9_repin_attestation_recorder.sql"),
  "utf8",
);
const repairMigration = readFileSync(
  resolve("supabase/migrations/20260929110000_r58_1_recorder_pin_repair.sql"),
  "utf8",
);
const workflowRegistry = JSON.parse(
  readFileSync(resolve("scripts/approved_attestation_workflow.json"), "utf8"),
) as { source_sha: string };

const OLD_DEPLOYMENT = "6330c8c4-a410-45db-a364-4eb47702c2fc";
const OLD_WORKFLOW_SHA = "de6732f465cae08c96aece304558273242b7016d";

function parity(args: {
  appDeployment: string;
  databaseDeployment: string;
  appWorkflowSha: string;
  databaseWorkflowSha: string;
}): boolean {
  return (
    args.appDeployment === args.databaseDeployment &&
    args.appWorkflowSha === args.databaseWorkflowSha
  );
}

describe("H.3-E.8.1 database attestation identity parity", () => {
  it("binds application, workflow registry, and database migration to the approved identity", () => {
    expect(workflowRegistry.source_sha).toBe(APPROVED_ATTESTATION_WORKFLOW_SHA);
    expect(migration).toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(migration).toContain(APPROVED_ATTESTATION_WORKFLOW_SHA);
    expect(migration).toContain(PARSER_ATTESTATION_EXPECTED.buildCommit);
    expect(migration).toContain(`git:${PARSER_ATTESTATION_EXPECTED.commit}`);
    // Historical pins stay in their own migrations, never rewritten.
    expect(repairMigration).toContain("207d0b66-dc8f-4ebc-96cd-6a2ef999f62a");
    expect(legacyMigration).toContain("207d0b66-dc8f-4ebc-96cd-6a2ef999f62a");
    expect(r582Migration).toContain("1b5778de-3eaf-46f1-9ea5-cba381d95313");
    expect(r589Migration).toContain("09b50029-2508-4267-bb1d-28c5e99b95db");
    expect(repairMigration).toContain("3070d8bae6c3f02093bbb2595138c913646c2e31");
    expect(
      parity({
        appDeployment: PARSER_ATTESTATION_EXPECTED.deploymentId,
        databaseDeployment: PARSER_ATTESTATION_EXPECTED.deploymentId,
        appWorkflowSha: APPROVED_ATTESTATION_WORKFLOW_SHA,
        databaseWorkflowSha: workflowRegistry.source_sha,
      }),
    ).toBe(true);
  });

  it.each([
    [OLD_DEPLOYMENT, APPROVED_ATTESTATION_WORKFLOW_SHA],
    [PARSER_ATTESTATION_EXPECTED.deploymentId, OLD_WORKFLOW_SHA],
    [OLD_DEPLOYMENT, OLD_WORKFLOW_SHA],
  ])(
    "rejects mixed or stale database identity %s / %s",
    (databaseDeployment, databaseWorkflowSha) => {
      expect(
        parity({
          appDeployment: PARSER_ATTESTATION_EXPECTED.deploymentId,
          databaseDeployment,
          appWorkflowSha: APPROVED_ATTESTATION_WORKFLOW_SHA,
          databaseWorkflowSha,
        }),
      ).toBe(false);
    },
  );

  it("reconciles the live pin without deleting or rewriting attestation rows", () => {
    expect(r582Migration).toContain("R5.8.2 live deployment-pin reconciliation.");
    expect(r582Migration).toContain("_old_deployment");
    expect(r582Migration).toContain("_new_deployment");
    expect(r582Migration).toContain("_old_source_commit");
    expect(r582Migration).toContain("_new_source_commit");
    for (const sql of [r582Migration, migration]) {
      expect(sql).toContain("p.prosecdef");
      expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/TRUNCATE\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/UPDATE\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/GRANT\s+EXECUTE/i);
      expect(sql).not.toMatch(/SECURITY\s+INVOKER/i);
    }
    expect(r582Migration).toContain(`ARRAY['search_path=""']`);
    expect(migration).toContain("R5_8_10_RECORDER_UNEXPECTED_DEFINITION");
  });
});
