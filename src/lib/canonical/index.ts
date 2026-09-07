/**
 * FASE 2.6 — public surface of the Canonical Match Engine.
 *
 * Downstream code imports from here and stays source-agnostic.
 */
export * from "./canonical.versions";
export * from "./canonical.types";
export * from "./canonical.quality";
export * from "./canonical.adapter";
export * from "./canonical.projection";
export * from "./canonical.resolver";
export { demoToCanonicalBundle, type DemoAdapterInput } from "./adapters/demo.adapter";
export {
  faceitToCanonicalBundles,
  faceitToCanonicalObservation,
  type FaceitCanonicalObservation,
  type FaceitAdapterInput,
  type FaceitParticipantInput,
} from "./adapters/faceit.adapter";
export { gamersClubCanonicalAdapter } from "./adapters/gamersclub.adapter";
