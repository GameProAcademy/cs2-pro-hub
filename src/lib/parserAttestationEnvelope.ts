import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const parserAttestationEnvelopeSchema = z.object({
  result: z.object({
    status: z.literal("VERIFIED"),
    blockers: z.array(z.string()).length(0),
    attestation_digest: z.string().regex(/^[0-9a-f]{64}$/),
    payload: jsonRecordSchema,
  }),
  canonicalPayload: z.string().min(2),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
  oidcToken: z.string().min(100),
  releaseGateEvidence: jsonRecordSchema,
});
