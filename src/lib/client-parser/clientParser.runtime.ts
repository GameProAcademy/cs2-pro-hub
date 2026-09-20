import { sha256Text, stableClientJson } from "./clientParser.hash";
import {
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_VERSION,
  CLIENT_PLAYER_LIMIT,
  type ClientCapability,
  type ClientParserArtifactProvenance,
  type ClientPlayerInventory,
  type ClientRuntimeSurface,
} from "./clientParser.types";

export const CLIENT_RUNTIME_EXPORT_NAMES = [
  "listGameEvents",
  "parseEvent",
  "parseEvents",
  "parseGrenades",
  "parseHeader",
  "parsePlayerInfo",
  "parseTicks",
] as const;

export const CLIENT_REQUIRED_RUNTIME_EXPORTS = ["parseHeader", "listGameEvents"] as const;

export const CLIENT_PARSER_ARTIFACT_PROVENANCE: ClientParserArtifactProvenance = {
  status: "UNAVAILABLE",
  sourceRepository: "https://github.com/LaihoE/demoparser",
  sourceCommit: "d3767705dc5846d73ed29db50eaeda58778dc934",
  sourceTag: "v0.42.0",
  buildTool: "wasm-pack (upstream version unpinned)",
  buildCommand: "wasm-pack build --out-dir www/pkg --target no-modules",
  bindingUrl: null,
  wasmUrl: null,
  wasmBindingSha256: null,
  wasmBinarySha256: null,
  reason: "upstream_0_42_0_has_no_published_or_reproducibly_pinned_browser_artifact",
};

export function inspectRuntimeSurface(runtime: Record<string, unknown>): ClientRuntimeSurface {
  const observedExports = CLIENT_RUNTIME_EXPORT_NAMES.filter(
    (name) => typeof runtime[name] === "function",
  );
  return {
    observedExports,
    minimumReady: CLIENT_REQUIRED_RUNTIME_EXPORTS.every((name) => observedExports.includes(name)),
    runtimeSurfaceDigest: sha256Text(
      stableClientJson({
        parserName: CLIENT_PARSER_NAME,
        parserVersion: CLIENT_PARSER_VERSION,
        buildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
        observedExports,
      }),
    ),
  };
}

export function capabilitiesForSurface(surface: ClientRuntimeSurface): ClientCapability[] {
  return CLIENT_RUNTIME_EXPORT_NAMES.map((id) => {
    const available = surface.observedExports.includes(id);
    return {
      id,
      classification: available ? "RAW_ONLY" : "UNAVAILABLE",
      available,
      nullOnly: false,
      reason: available
        ? "observed_client_api_never_grants_canonical_admission"
        : "not_exported_by_loaded_runtime",
      source: "demoparser2-wasm",
      parserName: CLIENT_PARSER_NAME,
      parserVersion: CLIENT_PARSER_VERSION,
    };
  });
}

function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

function safeString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function playerInventoryFromRuntime(
  runtime: Record<string, unknown>,
  bytes: Uint8Array,
): ClientPlayerInventory {
  const parser = runtime["parsePlayerInfo"];
  if (typeof parser !== "function") return { status: "UNAVAILABLE", count: null, players: [] };
  try {
    const players = rows(parser(bytes))
      .slice(0, CLIENT_PLAYER_LIMIT)
      .map((row) => ({
        steamId: safeString(row["steamid"] ?? row["steam_id"]),
        name: safeString(row["name"] ?? row["player_name"]),
        teamNumber: safeNumber(row["team_number"] ?? row["teamNumber"]),
      }));
    return { status: "AVAILABLE", count: players.length, players };
  } catch {
    return { status: "PARSE_FAILED", count: null, players: [] };
  }
}

export function trustedRuntimeUrl(raw: string | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin || url.protocol !== base.protocol) return null;
    if (url.username || url.password || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}