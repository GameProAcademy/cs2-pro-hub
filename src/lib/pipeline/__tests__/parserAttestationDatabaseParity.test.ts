import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import { APPROVED_ATTESTATION_WORKFLOW_SHA } from "@/lib/parserAttestationWorkflowRegistry";

const legacyMigration = readFileSync(
  resolve("supabase/migrations/20260929103000_reconcile_r58_live_attestation_pins.sql"),
  "utf8",
);
const migration = readFileSync(
  resolve("supabase/migrations/20261005090000_r58_2_live_deployment_pin_reconciliation.sql"),
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
    expect(migration).not.toContain("207d0b66-dc8f-4ebc-96cd-6a2ef999f62a");
    expect(migration).toContain(APPROVED_ATTESTATION_WORKFLOW_SHA);
    expect(repairMigration).toContain("207d0b66-dc8f-4ebc-96cd-6a2ef999f62a");
    expect(legacyMigration).toContain("207d0b66-dc8f-4ebc-96cd-6a2ef999f62a");
    expect(migration).toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(repairMigration).toContain(APPROVED_ATTESTATION_WORKFLOW_SHA);
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

  it("requires empty state and preserves function security before replacement", () => {
    expect(migration).toContain("FROM public.parser_runtime_provenance");
    expect(migration).toContain("FROM public.parser_attestation_nonces");
    expect(migration).toContain("R5_8_PIN_RECONCILIATION_REQUIRES_EMPTY_ATTESTATION_STATE");
    expect(migration).toContain("p.prosecdef");
    expect(migration).toContain(`ARRAY['search_path=""']`);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE/i);
    expect(migration).not.toMatch(/SECURITY\s+INVOKER/i);
  });
});
