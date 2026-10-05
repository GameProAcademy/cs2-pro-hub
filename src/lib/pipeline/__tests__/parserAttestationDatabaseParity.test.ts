import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PARSER_ATTESTATION_EXPECTED } from "@/lib/parserAttestation";
import { APPROVED_ATTESTATION_WORKFLOW_SHA } from "@/lib/parserAttestationWorkflowRegistry";

const migration = readFileSync(
  resolve("supabase/migrations/20260929103000_reconcile_r58_live_attestation_pins.sql"),
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
    expect(migration).toContain(
      `_new_deployment constant text := '${PARSER_ATTESTATION_EXPECTED.deploymentId}'`,
    );
    expect(migration).toContain(
      `_new_workflow_sha constant text := '${APPROVED_ATTESTATION_WORKFLOW_SHA}'`,
    );
    expect(repairMigration).toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
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
    expect(migration).toContain("_provenance_count <> 0 OR _nonce_count <> 0");
    expect(migration).toContain("p.prosecdef");
    expect(migration).toContain(`ARRAY['search_path=""']`);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE/i);
    expect(migration).not.toMatch(/SECURITY\s+INVOKER/i);
  });
});
