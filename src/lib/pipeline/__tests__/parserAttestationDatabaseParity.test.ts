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
// The immutable previous repin remains historical.
const r5810Migration = readFileSync(
  resolve("supabase/migrations/20261014210000_r5_8_10_repin_attestation_recorder.sql"),
  "utf8",
);
const r5810BoundaryMigration = readFileSync(
  resolve("supabase/migrations/20261014210100_r5_8_10b_repin_provenance_boundary.sql"),
  "utf8",
);
const r5812WorkflowMigration = readFileSync(
  resolve("supabase/migrations/20261017180000_r5_8_12_repin_workflow_source_sha.sql"),
  "utf8",
);
// R5.8.13 re-pinned the deployment identity after the PARSER_BUILD_REVISION correction.
const r5813DeploymentMigration = readFileSync(
  resolve("supabase/migrations/20261018050000_r5_8_13_repin_runtime_deployment.sql"),
  "utf8",
);
// R5.8.14 re-pinned semantic/build commit, deployment and the parser.py blob after the D13 release.
// R5.8.15 re-pinned them again after the D13b release (PR #162); R5.8.16 after the D22
// release (PR #177, deploy marker PR #179); R5.8.17 after the D25 release (PR #184); R5.8.18 after D29 (PR #192);
// R5.8.19 after D30 (PR #196); R5.8.20 after D33 (PR #202); R5.8.21 after D35/D36 (PR #209);
// R5.8.22 after the player_disconnect.ever_fully_connected review (PR #232, raw_evidence.py blob);
// R5.8.23 after the parser field-governance review (PR #239, raw_evidence.py blob);
// R5.8.24 after spatial-v1 layer A (PR #267, parser.py and raw_evidence.py blobs);
// R5.8.25 after demoparser2 0.42.2 (PR #275, parser version and parser/adapter/raw_evidence/settings blobs);
// R5.8.26 after PM6 PR F (PR #279, raw_evidence.py blob).
const r5826ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261113213000_r5_8_26_repin_runtime_release.sql"),
  "utf8",
);
const r5825ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261113040000_r5_8_25_repin_runtime_release.sql"),
  "utf8",
);
const r5824ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261112090000_r5_8_24_repin_runtime_release.sql"),
  "utf8",
);
const r5823ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261104100000_r5_8_23_repin_runtime_release.sql"),
  "utf8",
);
const r5822ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261103190000_r5_8_22_repin_runtime_release.sql"),
  "utf8",
);
const r5821ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261029100000_r5_8_21_repin_runtime_release.sql"),
  "utf8",
);
const r5820ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261028110000_r5_8_20_repin_runtime_release.sql"),
  "utf8",
);
const r5819ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261027100000_r5_8_19_repin_runtime_release.sql"),
  "utf8",
);
const r5818ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261027090000_r5_8_18_repin_runtime_release.sql"),
  "utf8",
);
const r5817ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261023090000_r5_8_17_repin_runtime_release.sql"),
  "utf8",
);
const r5816ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261022234000_r5_8_16_repin_runtime_release.sql"),
  "utf8",
);
const r5815ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261020210000_r5_8_15_repin_runtime_release.sql"),
  "utf8",
);
const r5814ReleaseMigration = readFileSync(
  resolve("supabase/migrations/20261020080000_r5_8_14_repin_runtime_release.sql"),
  "utf8",
);
// R5.8.11/11b keep the deployment they were generated for (ce9b760d); R5.8.13 advances it.
const migration = readFileSync(
  resolve("supabase/migrations/20261016100000_r5_8_11_repin_attestation_recorder.sql"),
  "utf8",
);
const boundaryMigration = readFileSync(
  resolve("supabase/migrations/20261016100100_r5_8_11b_repin_provenance_boundary.sql"),
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
    // R5.8.26 lists its pins as arrays: the head identity is in the new-pin list.
    const r5826NewPins = r5826ReleaseMigration.slice(
      r5826ReleaseMigration.indexOf("_new_pins constant"),
      r5826ReleaseMigration.indexOf("_counts constant"),
    );
    expect(r5826NewPins).toContain(`'${PARSER_ATTESTATION_EXPECTED.deploymentId}'`);
    expect(r5826NewPins).toContain(`'${PARSER_ATTESTATION_EXPECTED.commit}'`);
    expect(r5826ReleaseMigration).toContain("'d57b9089-ea97-44b0-b236-6868f84459e2'");
    // The parser runtime version was last re-pinned by R5.8.25 and is unchanged since.
    const r5825NewPins = r5825ReleaseMigration.slice(
      r5825ReleaseMigration.indexOf("_new_pins constant"),
      r5825ReleaseMigration.indexOf("_counts constant"),
    );
    expect(r5825NewPins).toContain("'d57b9089-ea97-44b0-b236-6868f84459e2'");
    expect(r5825NewPins).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5825NewPins).toContain(
      `'_p.parser_version<>''${PARSER_ATTESTATION_EXPECTED.parserVersion}'''`,
    );
    expect(PARSER_ATTESTATION_EXPECTED.buildCommit).toBe(PARSER_ATTESTATION_EXPECTED.commit);
    expect(r5825ReleaseMigration).toContain("'0ff96670-e373-4beb-90c9-f1967eee3195'");
    // The R5.8.24 link stays committed with its own pins.
    expect(r5824ReleaseMigration).toContain(
      "_new_deployment constant text := '0ff96670-e373-4beb-90c9-f1967eee3195'",
    );
    expect(r5824ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5824ReleaseMigration).toContain(
      "_old_deployment constant text := '7324404e-f15d-45a0-8ec7-518a0770ca81'",
    );
    // The R5.8.23 link stays committed with its own pins.
    expect(r5823ReleaseMigration).toContain(
      "_new_deployment constant text := '7324404e-f15d-45a0-8ec7-518a0770ca81'",
    );
    expect(r5823ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5823ReleaseMigration).toContain(
      "_old_deployment constant text := '2edd7ed1-2703-42ad-abe3-ebe13d235e81'",
    );
    // The R5.8.22 link stays committed with its own pins.
    expect(r5822ReleaseMigration).toContain(
      "_new_deployment constant text := '2edd7ed1-2703-42ad-abe3-ebe13d235e81'",
    );
    expect(r5822ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5822ReleaseMigration).toContain(
      "_old_deployment constant text := '1c0f26d5-4064-4e6d-a552-2ce05ae517fe'",
    );
    // The R5.8.21 link stays committed with its own pins.
    expect(r5821ReleaseMigration).toContain(
      "_new_deployment constant text := '1c0f26d5-4064-4e6d-a552-2ce05ae517fe'",
    );
    expect(r5821ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5821ReleaseMigration).toContain(
      "_old_deployment constant text := 'b0895901-1330-4676-9f57-95ddb99060c2'",
    );
    // The R5.8.20 link stays committed with its own pins.
    expect(r5820ReleaseMigration).toContain(
      "_new_deployment constant text := 'b0895901-1330-4676-9f57-95ddb99060c2'",
    );
    expect(r5820ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5820ReleaseMigration).toContain(
      "_old_deployment constant text := '7179fcce-cb04-4c35-9d4b-eb025166b4fd'",
    );
    // The R5.8.19 link stays committed with its own pins.
    expect(r5819ReleaseMigration).toContain(
      "_new_deployment constant text := '7179fcce-cb04-4c35-9d4b-eb025166b4fd'",
    );
    expect(r5819ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5819ReleaseMigration).toContain(
      "_old_deployment constant text := '13873137-13fe-4d09-9038-0fc680f1e91c'",
    );
    // The R5.8.18 link stays committed with its own pins.
    expect(r5818ReleaseMigration).toContain(
      "_new_deployment constant text := '13873137-13fe-4d09-9038-0fc680f1e91c'",
    );
    expect(r5818ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5818ReleaseMigration).toContain(
      "_old_deployment constant text := '02e64c36-75de-4d88-aa15-e3c661879d64'",
    );
    // The R5.8.17 link stays committed with its own pins.
    expect(r5817ReleaseMigration).toContain(
      "_new_deployment constant text := '02e64c36-75de-4d88-aa15-e3c661879d64'",
    );
    expect(r5817ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5817ReleaseMigration).toContain(
      "_old_deployment constant text := '1886c473-5251-4110-8ba3-60821e0b256b'",
    );
    // The R5.8.16 link stays committed with its own pins.
    expect(r5816ReleaseMigration).toContain(
      "_new_deployment constant text := '1886c473-5251-4110-8ba3-60821e0b256b'",
    );
    expect(r5816ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5816ReleaseMigration).toContain(
      "_old_deployment constant text := '01998834-4c35-43c2-b3e4-976f76a21fd5'",
    );
    // The R5.8.15 link stays committed with its own pins.
    expect(r5815ReleaseMigration).toContain(
      "_new_deployment constant text := '01998834-4c35-43c2-b3e4-976f76a21fd5'",
    );
    expect(r5815ReleaseMigration).toContain(
      "_old_deployment constant text := '3acb47c5-d9a4-43f2-acff-9ead7cb12b30'",
    );
    expect(r5815ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    // The R5.8.14 link stays committed with its own pins.
    expect(r5814ReleaseMigration).toContain(
      "_new_deployment constant text := '3acb47c5-d9a4-43f2-acff-9ead7cb12b30'",
    );
    expect(r5814ReleaseMigration).toContain(
      "_old_deployment constant text := 'ece1c582-5cba-403d-b25c-a60faaf1aed5'",
    );
    expect(r5814ReleaseMigration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    // The R5.8.13 link stays committed with its own pins.
    expect(r5813DeploymentMigration).toContain(
      "_new constant text := 'ece1c582-5cba-403d-b25c-a60faaf1aed5'",
    );
    expect(r5813DeploymentMigration).toContain(
      "_old constant text := 'ce9b760d-c92f-4da1-a3e6-dd105d49585c'",
    );
    expect(migration).toContain("ce9b760d-c92f-4da1-a3e6-dd105d49585c");
    expect(boundaryMigration).toContain("ce9b760d-c92f-4da1-a3e6-dd105d49585c");
    expect(migration).not.toContain(PARSER_ATTESTATION_EXPECTED.deploymentId);
    expect(r5810Migration).toContain("25df86c3-22e1-4986-9b91-cdabe54535c5");
    expect(r5810Migration).toContain("60099ed3eaf959d888762bf55043255a63a6a766");
    expect(r5810BoundaryMigration).toContain("25df86c3-22e1-4986-9b91-cdabe54535c5");
    // R5.8.11/11b preserve their original source pins; the additive R5.8.12 migration advances the current DB functions.
    expect(migration).toContain("523cee5b0fecc21c7ce2b5f538b42670eec3fed1");
    expect(boundaryMigration).toContain("523cee5b0fecc21c7ce2b5f538b42670eec3fed1");
    expect(r5812WorkflowMigration).toContain(APPROVED_ATTESTATION_WORKFLOW_SHA);
    expect(r5812WorkflowMigration).toContain("523cee5b0fecc21c7ce2b5f538b42670eec3fed1");
    // R5.8.11 keeps the build/semantic commits it was generated for (eaaa2c8d / c2e045b0);
    // R5.8.14 advances them, and the R5.8.14 migration names both old and new values.
    expect(migration).toContain("eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1");
    expect(migration).toContain("git:c2e045b0f71a7699c935b65ffe514fe526889de3");
    expect(migration).not.toContain(PARSER_ATTESTATION_EXPECTED.commit);
    expect(r5814ReleaseMigration).toContain("eaaa2c8d548c1b0eda3dca1ffc3d36c1e5af6aa1");
    expect(r5814ReleaseMigration).toContain("c2e045b0f71a7699c935b65ffe514fe526889de3");
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
    for (const sql of [
      r582Migration,
      r5810Migration,
      r5810BoundaryMigration,
      migration,
      boundaryMigration,
    ]) {
      expect(sql).toContain("p.prosecdef");
      expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/TRUNCATE\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/UPDATE\s+public\.parser_runtime_provenance/i);
      expect(sql).not.toMatch(/GRANT\s+EXECUTE/i);
      expect(sql).not.toMatch(/SECURITY\s+INVOKER/i);
    }
    expect(r582Migration).toContain(`ARRAY['search_path=""']`);
    expect(migration).toContain("R5_8_11_RECORDER_UNEXPECTED_DEFINITION");
  });
});
