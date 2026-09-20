import { sha256Text, stableClientJson } from "./clientParser.hash";
import {
  CLIENT_CAPABILITY_CLASSIFICATIONS,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_VERSION,
  type ClientCapability,
} from "./clientParser.types";

export const CLIENT_PARSER_CAPABILITY_CATALOG: ClientCapability[] = [
  ["parseHeader", "RAW_ONLY"],
  ["listGameEvents", "RAW_ONLY"],
  ["parseEvent", "RAW_ONLY"],
  ["parseEvents", "RAW_ONLY"],
  ["parsePlayerInfo", "UNAVAILABLE"],
  ["parseGrenades", "RAW_ONLY"],
  ["parseTicks", "RAW_ONLY"],
].map(([id, classification]) => ({
  id: String(id),
  classification: classification as ClientCapability["classification"],
  available: classification !== "UNAVAILABLE",
  nullOnly: false,
  reason:
    classification === "UNAVAILABLE"
      ? "not_exported_by_published_wasm_surface"
      : "client_observation_never_grants_canonical_admission",
  source: "demoparser2-wasm",
  parserName: CLIENT_PARSER_NAME,
  parserVersion: CLIENT_PARSER_VERSION,
}));

export const CLIENT_PARSER_CATALOG_DIGEST = sha256Text(stableClientJson(CLIENT_PARSER_CAPABILITY_CATALOG));
export const CLIENT_PARSER_CAPABILITY_DIGEST = sha256Text(
  stableClientJson({
    classifications: CLIENT_CAPABILITY_CLASSIFICATIONS,
    capabilities: CLIENT_PARSER_CAPABILITY_CATALOG,
  }),
);
