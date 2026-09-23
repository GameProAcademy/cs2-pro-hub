import { PARSER_ATTESTATION_EXPECTED, PARSER_ATTESTATION_OIDC } from "@/lib/parserAttestation";
import {
  APPROVED_ATTESTATION_WORKFLOW_PATH,
  APPROVED_ATTESTATION_WORKFLOW_SHA,
} from "@/lib/parserAttestationWorkflowRegistry";

export const R58_DIAGNOSTIC_STATES = [
  "CONFIGURED",
  "MISSING",
  "MISMATCH",
  "INVALID",
  "BLOCKED",
  "NOT_CHECKED",
] as const;
export type R58DiagnosticState = (typeof R58_DIAGNOSTIC_STATES)[number];

export interface R58DiagnosticItem {
  key: string;
  state: R58DiagnosticState;
}

export interface R58OperatorDiagnostic {
  overallStatus: "PASS" | "BLOCKED" | "PARTIAL";
  configurationStatus: "READY" | "BLOCKED";
  operatorAction: "DATABASE_HMAC_CONFIGURATION_REQUIRED" | null;
  items: R58DiagnosticItem[];
  attestationPreflight: {
    attestation_preflight_status: "BLOCKED";
    configuration_status: "BLOCKED" | "PARTIAL";
    workflow_status: "CONFIGURED";
    railway_status: "BLOCKED" | "NOT_CHECKED";
    oidc_status: "CONFIGURED";
    hmac_status: "BLOCKED" | "NOT_CHECKED";
    nonce_status: "NOT_CHECKED";
    freshness_status: "NOT_CHECKED";
    runtime_identity_status: "CONFIGURED";
    critical_hash_status: "CONFIGURED";
    release_mapping_status: "BLOCKED";
    canonical_status: "BLOCKED";
    attempt_9_status: "BLOCKED";
    overall_status: "BLOCKED";
  };
}

type GateSnapshot = {
  hmac_configured?: boolean;
  provenance_verified_count?: number;
  mapping_count?: number;
  mapping_authorized_count?: number;
  mapping_verified_count?: number;
  attempt_9_count?: number;
  attempt_10_plus_count?: number;
};

function configured(value: string | undefined): R58DiagnosticState {
  return value && value.trim().length >= 32 ? "CONFIGURED" : "MISSING";
}

export async function buildR58OperatorDiagnostic(): Promise<R58OperatorDiagnostic> {
  const endpoint = process.env["PARSER_ATTESTATION_ENDPOINT"];
  const endpointState: R58DiagnosticState = endpoint
    ? endpoint === "https://gamepro.network/api/public/parser-attestation"
      ? "CONFIGURED"
      : "MISMATCH"
    : "MISSING";
  const transportState = configured(process.env["PARSER_ATTESTATION_TRANSPORT_SECRET"]);
  const hmacState = configured(process.env["PARSER_ATTESTATION_HMAC_SECRET"]);
  const railwayState: R58DiagnosticState = process.env["RAILWAY_API_TOKEN"]
    ? "CONFIGURED"
    : "NOT_CHECKED";

  let gate: GateSnapshot | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("pre_real_demo_gate_status");
    if (!error && data && typeof data === "object" && !Array.isArray(data)) {
      gate = data as GateSnapshot;
    }
  } catch {
    gate = null;
  }

  const databaseHmacState: R58DiagnosticState = gate
    ? gate.hmac_configured === true
      ? "CONFIGURED"
      : "MISSING"
    : "NOT_CHECKED";
  const attemptsLocked =
    gate?.attempt_9_count === 0 && gate?.attempt_10_plus_count === 0 ? "CONFIGURED" : "BLOCKED";
  const releaseMapping =
    gate?.mapping_count === 105 &&
    gate.mapping_authorized_count === 0 &&
    gate.mapping_verified_count === 0
      ? "CONFIGURED"
      : gate
        ? "MISMATCH"
        : "NOT_CHECKED";
  const provenance = (gate?.provenance_verified_count ?? 0) > 0 ? "CONFIGURED" : "BLOCKED";

  const items: R58DiagnosticItem[] = [
    { key: "PARSER_ATTESTATION_ENDPOINT", state: endpointState },
    { key: "PARSER_ATTESTATION_TRANSPORT_SECRET", state: transportState },
    { key: "PARSER_ATTESTATION_HMAC_SECRET", state: hmacState },
    { key: "DATABASE_HMAC_SETTING", state: databaseHmacState },
    { key: "RAILWAY_API_TOKEN", state: railwayState },
    {
      key: "GITHUB_OIDC_EXPECTED",
      state:
        PARSER_ATTESTATION_OIDC.audience === "gamepro-parser-attestation"
          ? "CONFIGURED"
          : "INVALID",
    },
    {
      key: "APPROVED_WORKFLOW",
      state:
        APPROVED_ATTESTATION_WORKFLOW_PATH === PARSER_ATTESTATION_EXPECTED.workflowPath &&
        APPROVED_ATTESTATION_WORKFLOW_SHA === PARSER_ATTESTATION_EXPECTED.workflowSourceSha
          ? "CONFIGURED"
          : "MISMATCH",
    },
    { key: "RAILWAY_RUNTIME_BINDING", state: "CONFIGURED" },
    { key: "RUNTIME_IDENTITY", state: provenance },
    { key: "CRITICAL_FILE_HASHES", state: provenance },
    { key: "RELEASE_MAPPING", state: releaseMapping },
    { key: "REAL_DEM_AUTHORIZATION", state: "BLOCKED" },
    { key: "ATTEMPT_9_LOCK", state: attemptsLocked },
    { key: "CANONICAL_LOCK", state: "BLOCKED" },
  ];
  const configurationReady = [endpointState, transportState, hmacState, databaseHmacState].every(
    (state) => state === "CONFIGURED",
  );

  return {
    overallStatus: "BLOCKED",
    configurationStatus: configurationReady ? "READY" : "BLOCKED",
    operatorAction:
      databaseHmacState === "CONFIGURED" ? null : "DATABASE_HMAC_CONFIGURATION_REQUIRED",
    items,
    attestationPreflight: {
      attestation_preflight_status: "BLOCKED",
      configuration_status: configurationReady ? "PARTIAL" : "BLOCKED",
      workflow_status: "CONFIGURED",
      railway_status: railwayState === "CONFIGURED" ? "BLOCKED" : "NOT_CHECKED",
      oidc_status: "CONFIGURED",
      hmac_status: databaseHmacState === "NOT_CHECKED" ? "NOT_CHECKED" : "BLOCKED",
      nonce_status: "NOT_CHECKED",
      freshness_status: "NOT_CHECKED",
      runtime_identity_status: "CONFIGURED",
      critical_hash_status: "CONFIGURED",
      release_mapping_status: "BLOCKED",
      canonical_status: "BLOCKED",
      attempt_9_status: "BLOCKED",
      overall_status: "BLOCKED",
    },
  };
}
