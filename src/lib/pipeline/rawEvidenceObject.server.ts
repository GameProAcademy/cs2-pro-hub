import { PipelineError } from "@/lib/pipeline/errors";
import { RAW_EVIDENCE_BUCKET } from "@/lib/pipeline/storage.server";
import { RAW_CHUNK_HARD_MAX_BYTES } from "@/lib/pipeline/types";

/**
 * Downloads ONE private RAW chunk as bytes, so the APP can hash and decode the
 * exact object it marks verified. RAW chunks are bounded by
 * RAW_CHUNK_HARD_MAX_BYTES; demo files never go through here (the storage layer
 * keeps streaming them, see storage.server.ts).
 */
export async function downloadRawEvidenceChunk(
  storagePath: string,
  expectedBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > RAW_CHUNK_HARD_MAX_BYTES
  )
    throw new PipelineError("PARSER_INVALID_RESPONSE", "invalid RAW chunk metadata");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(RAW_EVIDENCE_BUCKET)
    .download(storagePath);
  if (error || !data)
    throw new PipelineError("PERSISTENCE_ERROR", error?.message ?? "raw object unavailable");
  if (data.size !== expectedBytes)
    throw new PipelineError("PARSER_INVALID_RESPONSE", "RAW chunk verification failed");
  return new Uint8Array(await data.arrayBuffer());
}
