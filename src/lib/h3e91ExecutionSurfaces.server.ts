/** R4 inventory of DEM parser entry points. This read model does not authorize execution. */
export const H3E91_EXECUTION_SURFACES = [
  "APP_REMOTE_PARSER",
  "RAILWAY_DURABLE_WORKER",
  "RAILWAY_V1_PARSE",
  "BROWSER_WASM_POC",
] as const;

export type H3E91ExecutionSurface = (typeof H3E91_EXECUTION_SURFACES)[number];
export type H3E91SurfaceStatus =
  "ACTIVE_AND_INSTRUMENTED" | "SEALED_OFF" | "NOT_COVERED" | "UNKNOWN";

// An application flag alone does not seal the browser worker: the service can
// still be called directly, and a separate build may enable the POC.
const currentCoverage: Record<H3E91ExecutionSurface, H3E91SurfaceStatus> = {
  APP_REMOTE_PARSER: "NOT_COVERED",
  RAILWAY_DURABLE_WORKER: "NOT_COVERED",
  RAILWAY_V1_PARSE: "NOT_COVERED",
  BROWSER_WASM_POC: "NOT_COVERED",
};

export function inspectH3E91ExecutionSurfaces(
  discovered: readonly string[] = H3E91_EXECUTION_SURFACES,
) {
  const known = new Set<string>(H3E91_EXECUTION_SURFACES);
  const unexpected = discovered.filter((surface) => !known.has(surface));
  const missing = H3E91_EXECUTION_SURFACES.filter((surface) => !discovered.includes(surface));
  const surfaces = { ...currentCoverage };
  const values = Object.values(surfaces);
  return {
    surfaces,
    unknownSurfaceCount: values.filter((value) => value === "UNKNOWN").length + missing.length,
    uncoveredSurfaceCount: values.filter((value) => value === "NOT_COVERED").length,
    sealedOffSurfaceCount: values.filter((value) => value === "SEALED_OFF").length,
    activeInstrumentedSurfaceCount: values.filter((value) => value === "ACTIVE_AND_INSTRUMENTED")
      .length,
    unexpectedWriterCount: unexpected.length,
    writerCoverageVerified:
      unexpected.length === 0 &&
      missing.length === 0 &&
      values.every((value) => value === "ACTIVE_AND_INSTRUMENTED" || value === "SEALED_OFF"),
  };
}
