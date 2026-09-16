import { createHash, timingSafeEqual } from "node:crypto";

import { MAX_CONCURRENT_DEMO_JOBS, MAX_JOB_RETRIES } from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";
import { processJob, type DurableJobClaim } from "@/lib/pipeline/jobs.server";
import { mapParserErrorCode } from "@/lib/pipeline/parser/adapter";
import type { DurableDemoCompletionV1 } from "@/lib/pipeline/types";
import { createDemoSignedUrl, demoExists } from "@/lib/pipeline/storage.server";

const VISIBILITY_SECONDS = 15 * 60;

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function context() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin, rpc: supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as Rpc };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function authenticateDurableWorker(request: Request): Response | null {
  const expected = process.env["DEMO_PIPELINE_BRIDGE_SECRET"] ?? "";
  const header = request.headers.get("authorization") ?? "";
  const [scheme, supplied = ""] = header.split(" ", 2);
  if (!expected || scheme?.toLowerCase() !== "bearer" || !supplied || !timingSafeEqual(digest(expected), digest(supplied))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function claimDurableDemo(workerId: string) {
  const { rpc } = await context();
  const { data, error } = await rpc("claim_demo_parse_message", {
    _worker_id: workerId,
    _visibility_seconds: VISIBILITY_SECONDS,
    _max_concurrent: MAX_CONCURRENT_DEMO_JOBS,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const claim = data as Record<string, unknown> | null;
  if (!claim || claim["status"] !== "claimed") return claim ?? { status: "empty" };
  const storagePath = typeof claim["storage_path"] === "string" ? claim["storage_path"] : "";
  const exists = storagePath ? await demoExists(storagePath) : null;
  if (!exists) throw new PipelineError("DEMO_NOT_FOUND");
  return {
    status: "claimed",
    message_id: claim["message_id"],
    job_id: claim["job_id"],
    upload_id: claim["upload_id"],
    user_id: claim["user_id"],
    demo_sha256: claim["demo_sha256"],
    attempt: claim["attempt"],
    attempt_number: claim["attempt"],
    schema_version: claim["schema_version"],
    file_size: exists.size || claim["file_size"],
    demo_url: await createDemoSignedUrl(storagePath),
    visibility_seconds: VISIBILITY_SECONDS,
  };
}

export async function heartbeatDurableDemo(input: DurableJobClaim & { jobId: string; stage?: string | undefined }) {
  const { rpc } = await context();
  const { data, error } = await rpc("heartbeat_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
    _visibility_seconds: VISIBILITY_SECONDS,
    _stage: input.stage ?? null,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return data;
}

export async function completeDurableDemo(input: DurableJobClaim & { jobId: string } & DurableDemoCompletionV1) {
  const heartbeat = (await heartbeatDurableDemo({ ...input, stage: "persisting" })) as Record<string, unknown>;
  if (heartbeat["accepted"] !== true || heartbeat["cancelled"] === true) {
    return { status: heartbeat["cancelled"] === true ? "cancelled" : "stale" };
  }
  const result = await processJob(input.jobId, { hot: input.hot, raw: input.raw }, input);
  if (result.status !== "processed" && result.status !== "blocked_raw_audit") return result;
  const { rpc } = await context();
  const { data, error } = await rpc("finalize_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { ...result, queue: data };
}

export async function failDurableDemo(input: DurableJobClaim & { jobId: string; errorCode: string; detail?: string | undefined }) {
  const mapped = mapParserErrorCode(input.errorCode);
  const { rpc } = await context();
  const { data, error } = await rpc("fail_demo_parse_message", {
    _job_id: input.jobId,
    _message_id: input.messageId,
    _attempt: input.attempt,
    _worker_id: input.workerId,
    _error_code: mapped.code,
    _error_message: input.detail?.slice(0, 300) ?? null,
    _permanent: mapped.permanent,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  return { ...(data as object), maxRetries: MAX_JOB_RETRIES };
}