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
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
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
  const mappings = evidence["field_mappings"];
  if (
    evidence["raw_status"] !== "PASS" ||
    evidence["raw_audit_status"] !== "APPROVED" ||
    !Array.isArray(reasons) ||
    reasons.length > 0 ||
    !Array.isArray(gates) ||
    gates.length === 0 ||
    !Array.isArray(mappings) ||
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
  const mappingsPass = mappings.every((mapping) => {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return false;
    const item = mapping as Record<string, unknown>;
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