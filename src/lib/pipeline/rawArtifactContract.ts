import { createHash } from "node:crypto";

export const RAW_ARTIFACT_SECTION_ORDER = [
  "header",
  "players",
  "rounds",
  "events",
  "ticks",
  "grenades",
  "player-info",
  "game-state",
  "economy",
  "forensic",
] as const;

export function stableRawArtifactJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableRawArtifactJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableRawArtifactJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function rawArtifactSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const RAW_MAPPING_STATUSES = new Set([
  "MAPPED",
  "DERIVED",
  "RAW_ONLY_INTENTIONAL",
  "NOT_PRESENT_IN_DEMO",
  "UNAVAILABLE",
  "PARSE_FAILED",
  "UNMAPPED_BUT_AVAILABLE",
]);

export const RAW_FORENSIC_V2_REQUIRED_GATES = [
  "RAW-V2-01-parser-identity",
  "RAW-V2-02-capability-catalog",
  "RAW-V2-03-event-discovery",
  "RAW-V2-04-all-events-attempted",
  "RAW-V2-05-full-tick-domain",
  "RAW-V2-06-tick-batches",
  "RAW-V2-07-tick-gaps",
  "RAW-V2-08-tick-overlaps",
  "RAW-V2-09-properties-classified",
  "RAW-V2-10-header",
  "RAW-V2-11-player-info",
  "RAW-V2-12-rounds",
  "RAW-V2-13-bomb",
  "RAW-V2-14-combat",
  "RAW-V2-15-grenades",
  "RAW-V2-16-teams-score",
  "RAW-V2-17-usercmd",
  "RAW-V2-18-weapons-inventory",
  "RAW-V2-19-aggregates",
  "RAW-V2-20-mapping-complete",
  "RAW-V2-21-no-parse-failures",
  "RAW-V2-22-physical-reaudit",
] as const;

export function validateRawForensicContractV2(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["forensic_v2_missing"];
  const contract = value as Record<string, unknown>;
  const reasons: string[] = [];
  if (contract["audit_contract_version"] !== 2) reasons.push("forensic_v2_version_invalid");
  const parser = contract["parser"] as Record<string, unknown> | undefined;
  if (parser?.["name"] !== "demoparser2" || parser?.["version"] !== "0.42.0")
    reasons.push("forensic_v2_parser_invalid");
  const tick = contract["full_tick_audit"] as Record<string, unknown> | undefined;
  if (tick?.["coverage"] !== "FULL_TICK_DOMAIN_AUDIT" || tick?.["complete"] !== true)
    reasons.push("forensic_v2_full_tick_unproven");
  const gates = Array.isArray(contract["gates"])
    ? (contract["gates"] as Array<Record<string, unknown>>)
    : [];
  const byName = new Map(gates.map((gate) => [gate["gate"], gate]));
  for (const required of RAW_FORENSIC_V2_REQUIRED_GATES) {
    const gate = byName.get(required);
    if (!gate) reasons.push(`forensic_v2_gate_missing:${required}`);
    else if (required !== "RAW-V2-22-physical-reaudit" && gate["status"] !== "PASS")
      reasons.push(`forensic_v2_gate_blocked:${required}`);
  }
  if (gates.length !== RAW_FORENSIC_V2_REQUIRED_GATES.length)
    reasons.push("forensic_v2_gate_count_invalid");
  if (contract["physical_reaudit_required"] !== true)
    reasons.push("forensic_v2_physical_reaudit_not_required");
  if (!Array.isArray(contract["property_inventory"]) || !Array.isArray(contract["event_inventory"]))
    reasons.push("forensic_v2_inventory_invalid");
  if (!Array.isArray(contract["mapping_inventory"]) || contract["mapping_inventory"].length === 0)
    reasons.push("forensic_v2_mapping_invalid");
  return [...new Set(reasons)].sort();
}

export function validateRawAuditMappingInventory(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) return [];
  const seen = new Set<string>();
  const mappings: Array<Record<string, unknown>> = [];
  for (const mapping of value) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return [];
    const item = mapping as Record<string, unknown>;
    const rawField = item["raw_field"];
    const status = item["status"];
    if (
      typeof rawField !== "string" ||
      !rawField.trim() ||
      seen.has(rawField) ||
      typeof status !== "string" ||
      !RAW_MAPPING_STATUSES.has(status)
    ) {
      return [];
    }
    seen.add(rawField);
    mappings.push(item);
  }
  return mappings;
}

function hasMappingReason(mapping: Record<string, unknown>): boolean {
  const hasReasonField = Object.prototype.hasOwnProperty.call(mapping, "reason");
  const reason = mapping["reason"];
  if (hasReasonField) return typeof reason === "string" && reason.trim().length > 0;
  return mapping["reason_present"] === true;
}

/**
 * Re-derives APP-owned Canonical admission from either the full evidence mapping
 * (`reason`) or the compact durable-manifest projection (`reason_present`).
 */
export function deriveRawArtifactAuditStatus(
  manifest: Record<string, unknown>,
): "approved" | "blocked" {
  const value = manifest["audit_evidence"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return "blocked";
  const evidence = value as Record<string, unknown>;
  const reasons = evidence["raw_block_reasons"];
  const gates = evidence["gates"];
  const mappings = validateRawAuditMappingInventory(evidence["field_mappings"]);
  if (
    evidence["raw_status"] !== "PASS" ||
    evidence["raw_audit_status"] !== "APPROVED" ||
    !Array.isArray(reasons) ||
    reasons.length > 0 ||
    !Array.isArray(gates) ||
    gates.length === 0 ||
    mappings.length === 0
  ) {
    return "blocked";
  }
  const gatesPass = gates.every(
    (gate) =>
      gate &&
      typeof gate === "object" &&
      !Array.isArray(gate) &&
      (gate as Record<string, unknown>)["status"] === "PASS",
  );
  const mappingsPass = mappings.every((item) => {
    const rawField = item["raw_field"];
    const status = item["status"];
    if (typeof rawField !== "string" || !rawField.trim()) return false;
    if (typeof status !== "string" || !RAW_MAPPING_STATUSES.has(status)) return false;
    if (status === "PARSE_FAILED" || status === "UNMAPPED_BUT_AVAILABLE") return false;
    if (status === "RAW_ONLY_INTENTIONAL") return hasMappingReason(item);
    return true;
  });
  return gatesPass && mappingsPass ? "approved" : "blocked";
}
