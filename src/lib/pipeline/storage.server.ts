/**
 * Private demo storage helpers (server-only).
 *
 * Demos live in the private `demos` bucket under `{user_id}/{upload_id}.dem`
 * and are TEMPORARY: they are deleted after the retention window because only
 * the derived, normalised data is permanent.
 */
import {
  DEMO_BUCKET,
  DEMO_RETENTION_HOURS,
  FAILED_DEMO_RETENTION_HOURS,
} from "@/config/pipeline";
import { PipelineError } from "@/lib/pipeline/errors";

const SIGNED_URL_TTL_SECONDS = 60 * 15;

export function demoStoragePath(userId: string, uploadId: string): string {
  return `${userId}/${uploadId}.dem`;
}

export function retainUntil(success: boolean): string {
  const hours = success ? DEMO_RETENTION_HOURS : FAILED_DEMO_RETENTION_HOURS;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export async function createDemoSignedUrl(storagePath: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(DEMO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new PipelineError("DEMO_NOT_FOUND", error?.message ?? "signed url unavailable");
  }
  return data.signedUrl;
}

export async function demoExists(storagePath: string): Promise<{ size: number } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const slash = storagePath.lastIndexOf("/");
  const folder = storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const { data, error } = await supabaseAdmin.storage.from(DEMO_BUCKET).list(folder, {
    search: name,
    limit: 100,
  });
  if (error) throw new PipelineError("PERSISTENCE_ERROR", error.message);
  const found = data?.find((entry) => entry.name === name);
  if (!found) return null;
  const size = Number((found.metadata as { size?: number } | null)?.size ?? 0);
  return { size };
}

/** Removes the temporary demo. Cleanup failures never fail the analysis. */
export async function deleteDemo(storagePath: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage.from(DEMO_BUCKET).remove([storagePath]);
  if (error) throw new PipelineError("CLEANUP_ERROR", error.message);
}
