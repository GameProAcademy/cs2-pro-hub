import {
  CLIENT_PARSER_BUILD_IDENTITY,
  CLIENT_PARSER_CATALOG_VERSION,
  CLIENT_PARSER_CONTRACT_VERSION,
  CLIENT_PARSER_MANIFEST_VERSION,
  CLIENT_PARSER_NAME,
  CLIENT_PARSER_RUNTIME,
  CLIENT_PARSER_VERSION,
  type ClientParseResult,
  type ClientParserManifest,
} from "./clientParser.types";
import {
  CLIENT_PARSER_CAPABILITY_DIGEST,
  CLIENT_PARSER_CATALOG_DIGEST,
} from "./clientParser.capabilities";

export function buildClientParserManifest(result: ClientParseResult): ClientParserManifest {
  return {
    manifestVersion: CLIENT_PARSER_MANIFEST_VERSION,
    demoSha256: result.demo.sha256,
    demoSizeBytes: result.demo.sizeBytes,
    demoName: result.demo.name,
    demoLastModified: result.demo.lastModified,
    parserName: CLIENT_PARSER_NAME,
    parserVersion: CLIENT_PARSER_VERSION,
    parserRuntime: CLIENT_PARSER_RUNTIME,
    parserBuildIdentity: CLIENT_PARSER_BUILD_IDENTITY,
    parserRuntimeDigest: result.parser.runtimeDigest,
    contractVersion: CLIENT_PARSER_CONTRACT_VERSION,
    catalogVersion: CLIENT_PARSER_CATALOG_VERSION,
    catalogDigest: CLIENT_PARSER_CATALOG_DIGEST,
    capabilityDigest: CLIENT_PARSER_CAPABILITY_DIGEST,
    capabilityClassifications: [...new Set(result.capabilities.map((item) => item.classification))].sort(),
    coverage: result.coverage,
    semanticStatus: result.semanticStatus,
    resultDigest: result.resultDigest,
    generatedAt: new Date().toISOString(),
    performance: result.performance,
  };
}
