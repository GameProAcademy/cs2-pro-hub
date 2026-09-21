import surfaceManifest from "../../../docs/client-parser/upstream-surface-manifest.json";
import { sha256Text, stableClientJson } from "./clientParser.hash";
import type { ClientCapabilityClassification } from "./clientParser.types";

export const CLIENT_HEADER_FIELDS = surfaceManifest.fields
  .filter((entry) => entry.sourceApi === "parseHeader")
  .map((entry) => entry.propertyName);

export const CLIENT_TICK_PROPERTIES = surfaceManifest.fields
  .filter((entry) => entry.sourceApi === "parseTicks")
  .map((entry) => entry.propertyName);

export const CLIENT_PRIORITY_EVENTS = surfaceManifest.events.map((entry) => entry.eventName);

export const CLIENT_EVENT_CATALOG = Object.fromEntries(
  surfaceManifest.events.map((entry) => [entry.eventName, entry]),
);

export interface ClientEventFieldRequestMetadata {
  field: string;
  kind: "player" | "other";
  requestAllowed: boolean;
  requestReason: string;
  upstreamEvidence: string | null;
  semanticPurpose: string;
}

export interface ClientEventFieldRequest {
  playerFields: readonly string[];
  otherFields: readonly string[];
  fieldMetadata: readonly ClientEventFieldRequestMetadata[];
  rawOnlyFields: readonly string[];
  notRequestableFields: readonly string[];
  wasmUnavailableFields: readonly string[];
}

export const EVENT_FIELD_REQUEST_CATALOG: Readonly<Record<string, ClientEventFieldRequest>> =
  Object.fromEntries(
    surfaceManifest.events.map((entry) => {
      const fieldMetadata = [...entry.playerFields, ...entry.otherFields];
      return [
        entry.eventName,
        {
          playerFields: entry.playerFields
            .filter((field) => field.requestAllowed)
            .map((field) => field.field),
          otherFields: entry.otherFields
            .filter((field) => field.requestAllowed)
            .map((field) => field.field),
          fieldMetadata,
          rawOnlyFields: entry.rawOnlyFields,
          notRequestableFields: [
            ...entry.notRequestableFields,
            ...fieldMetadata.filter((field) => !field.requestAllowed).map((field) => field.field),
          ],
          wasmUnavailableFields: entry.wasmUnavailableFields,
        },
      ];
    }),
  );

const EMPTY_EVENT_REQUEST: ClientEventFieldRequest = {
  playerFields: [],
  otherFields: [],
  fieldMetadata: [],
  rawOnlyFields: [],
  notRequestableFields: [],
  wasmUnavailableFields: [],
};

export function eventFieldRequest(name: string): ClientEventFieldRequest {
  return EVENT_FIELD_REQUEST_CATALOG[name] ?? EMPTY_EVENT_REQUEST;
}

export const CLIENT_FIELD_AUDIT_CATALOG = surfaceManifest.fields.map((entry) => ({
  category: entry.category,
  eventOrEntity: entry.eventOrEntity,
  field: entry.propertyName,
  source: entry.sourceApi as
    | "parseHeader"
    | "parseEvent"
    | "parseTicks"
    | "parseGrenades",
  requestable: entry.runtimeRequestable,
  upstreamSupported: entry.upstreamSupported,
  upstreamSourceRef: entry.upstreamSourceRef,
  evidenceRefs: entry.evidenceRefs,
}));

export const CLIENT_UPSTREAM_SURFACE = surfaceManifest.fields.map((entry) => ({
  field: entry.propertyName,
  category: entry.category,
  eventOrEntity: entry.eventOrEntity,
  sourceAPI: entry.sourceApi,
  upstreamSupported: entry.upstreamSupported,
  upstreamVerification: entry.upstreamSupported ? ("SOURCE_VERIFIED" as const) : ("UPSTREAM_NOT_VERIFIED" as const),
  upstreamSourceRef: entry.upstreamSourceRef,
  projectCatalogued: entry.projectCatalogued,
  requestable: entry.runtimeRequestable,
  wasmExportAvailable: null as boolean | null,
  canonicalEligible: false as const,
  evidenceRefs: entry.evidenceRefs,
  reasonIfUnavailable: entry.upstreamSupported
    ? "requires_authorized_real_dem_runtime_observation"
    : "upstream_source_evidence_missing",
}));

export const CLIENT_UPSTREAM_API_CATALOG = surfaceManifest.apis;
export const CLIENT_SURFACE_METRICS = surfaceManifest.metrics;
export const CLIENT_AUDIT_CATALOG_DIGEST = surfaceManifest.catalogDigest;
export const CLIENT_PARSER_CONTRACT_DIGEST = surfaceManifest.contractDigest;

export const CLIENT_PARITY_DIMENSIONS = [
  "header", "map", "version", "playback_ticks", "tickrate", "player_count",
  "player_identities", "event_inventory", "player_death_count", "player_hurt_count",
  "round_start_count", "round_end_count", "bomb_events", "grenade_events",
  "event_tick_ordering", "controlled_tick_values", "position", "health", "armor",
  "weapon", "economy", "round_boundaries",
] as const;

export type ClientParityDimension = (typeof CLIENT_PARITY_DIMENSIONS)[number];
export type ClientParityStatus = "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED" | "NOT_AVAILABLE_ON_WASM";

export interface ClientFieldEvidence {
  field: string;
  observed: boolean;
  source: "parseHeader" | "parsePlayerInfo" | "parseEvent" | "parseTicks" | "parseGrenades";
  classification: ClientCapabilityClassification;
  value: unknown;
}

export function headerEvidence(header: Record<string, unknown>): ClientFieldEvidence[] {
  return CLIENT_HEADER_FIELDS.map((field) => ({
    field,
    observed: Object.prototype.hasOwnProperty.call(header, field),
    source: "parseHeader",
    classification: Object.prototype.hasOwnProperty.call(header, field) ? "RAW_ONLY" : "NOT_PRESENT",
    value: Object.prototype.hasOwnProperty.call(header, field) ? header[field] : null,
  }));
}

export function verifySurfaceManifestDigests(): boolean {
  const catalogDigest = sha256Text(stableClientJson({
    provenance: surfaceManifest.provenance,
    apis: surfaceManifest.apis,
    fields: surfaceManifest.fields,
    events: surfaceManifest.events,
  }));
  const contractDigest = sha256Text(stableClientJson({
    contractVersion: surfaceManifest.contractVersion,
    catalogVersion: surfaceManifest.catalogVersion,
    catalogDigest,
    limits: surfaceManifest.limits,
    policies: surfaceManifest.policies,
  }));
  return catalogDigest === CLIENT_AUDIT_CATALOG_DIGEST && contractDigest === CLIENT_PARSER_CONTRACT_DIGEST;
}
