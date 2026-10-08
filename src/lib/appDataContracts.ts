import { z } from "zod";

export type AppDataState<T> =
  | { status: "LOADING" | "EMPTY" | "NOT_AVAILABLE" | "BLOCKED"; data: null }
  | { status: "ERROR"; data: null; code: "APP_DATA_CONTRACT_INVALID" }
  | { status: "READY" | "DEMO_ONLY"; data: T };

/** Boundary validation, not a readiness evaluator or authorization mechanism. */
export function appDataState<T>(
  status: "LOADING" | "READY" | "EMPTY" | "ERROR" | "NOT_AVAILABLE" | "DEMO_ONLY" | "BLOCKED",
  input: unknown,
  schema: z.ZodType<T>,
): AppDataState<T> {
  if (status === "ERROR") return { status, data: null, code: "APP_DATA_CONTRACT_INVALID" };
  if (status !== "READY" && status !== "DEMO_ONLY") return { status, data: null };
  const result = schema.safeParse(input);
  return result.success ? { status, data: result.data }
    : { status: "ERROR", data: null, code: "APP_DATA_CONTRACT_INVALID" };
}

const identity = z.string().min(1).max(256);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const appRouteIdentitySchema = z.object({
  playerId: z.string().uuid().optional(),
  uploadId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
}).strict();
export const appUploadSchema = z.object({
  id: z.string().uuid(), name: identity, sizeBytes: z.number().int().positive(), sha256,
}).strict();
export const appProcessingSchema = z.object({
  jobId: z.string().uuid(), uploadId: z.string().uuid(),
  phase: z.enum(["QUEUED", "PROCESSING", "FINISHED", "FAILED", "CANCELLED"]),
  progress: z.number().finite().min(0).max(1),
}).strict();
export const appPlayerSchema = z.object({ id: z.string().uuid(), name: identity }).strict();
export const appDemoIdentitySchema = z.object({
  uploadId: z.string().uuid(), demoSha256: sha256,
  playerId: z.string().uuid().nullable(),
  status: z.enum(["IDENTIFIED", "NOT_AVAILABLE", "BLOCKED"]),
}).strict().refine((value) => value.status !== "IDENTIFIED" || value.playerId !== null);

export const demoDnaSchema = z.array(z.object({
  dimension: z.enum(["aim", "dueling", "survivability", "positioning", "utility",
    "decision_making", "teamplay", "economy", "clutch", "consistency"]),
  value: z.number().finite(), average: z.number().finite(),
}).strict()).min(1);
export const demoCoachSchema = z.array(z.object({
  id: identity, role: z.enum(["coach", "player"]), content: z.string().min(1), time: identity,
}).strict());

/** Future traceability only: callers cannot gain Canonical authority from this schema. */
export const futureMetricEvidenceSchema = z.object({
  source: z.literal("CANONICAL_VALIDATED_METRICS"),
  parserIdentity: identity, artifactIdentity: identity, demoSha256: sha256,
  domain: identity, evidenceRef: identity,
  calculationType: z.enum(["OBSERVED", "CALCULATED", "INFERRED"]),
  confidence: z.number().finite().min(0).max(1).nullable(),
  status: z.enum(["AVAILABLE", "NOT_AVAILABLE"]),
  value: z.number().finite().nullable(),
}).strict().refine((value) => value.status === "NOT_AVAILABLE"
  ? value.value === null && value.confidence === null : value.value !== null);

export const futureCoachContextSchema = z.object({
  status: z.literal("BLOCKED"),
  canonicalAuthorization: z.literal(false),
  metrics: z.array(futureMetricEvidenceSchema),
  assertions: z.array(z.object({
    kind: z.enum(["OBSERVED", "CALCULATED", "INFERRED", "NOT_AVAILABLE"]),
    evidenceRefs: z.array(identity),
  }).strict().refine((value) => value.kind === "NOT_AVAILABLE" || value.evidenceRefs.length > 0)),
}).strict();

/** Render-visible readiness is descriptive and permanently non-authorizing here. */
export const appParserReadinessSchema = z.object({
  status: z.literal("BLOCKED"), canonicalAuthorization: z.literal(false),
  canonicalEligible: z.literal(false), attempt9Authorization: z.literal(false),
  productionAuthorization: z.literal(false),
}).strict();