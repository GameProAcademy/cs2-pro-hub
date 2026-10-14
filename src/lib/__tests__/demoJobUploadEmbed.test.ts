import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * demo_jobs and uploads are linked by TWO foreign keys: demo_jobs.upload_id -> uploads
 * and uploads.supersedes_job_id -> demo_jobs. PostgREST cannot resolve a bare
 * `uploads(...)` embed from demo_jobs (PGRST201), so the query fails; code that ignored
 * the error showed "no job registered" next to non-zero counters and JOB_NOT_FOUND
 * for jobs that exist. Every embed must name the relationship.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith("types.ts") ? [path] : [];
  });
}

describe("demo_jobs -> uploads embed", () => {
  it("the schema really has the two relationships that make a bare embed ambiguous", () => {
    const migrations = readdirSync(resolve("supabase/migrations"))
      .map((name) => readFileSync(resolve("supabase/migrations", name), "utf8"))
      .join("\n");
    expect(migrations).toMatch(/supersedes_job_id\s+uuid[^,;]*REFERENCES\s+public\.demo_jobs/i);
  });

  it("every select on demo_jobs that embeds uploads names demo_jobs_upload_id_fkey", () => {
    const offenders = sources(resolve("src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /from\("demo_jobs"\)[\s\S]{0,400}?[\s,"]uploads\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
