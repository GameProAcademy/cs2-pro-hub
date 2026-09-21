import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260921073324_eb26ca2b-d870-4053-9865-4cdb352b045c.sql",
  "utf8",
);

describe("G.6-R.3 quality_flags JSONB regression", () => {
  it("preserves empty and populated JSON arrays without text[] coercion", () => {
    expect(migration).toContain(
      "quality_flags = COALESCE(_job_result->'quality_flags', '[]'::jsonb)",
    );
    expect(migration).not.toContain("jsonb_array_elements_text");
    expect(migration).not.toContain("'{}'::text[]");
  });

  it("keeps projection finalization atomic and service-role only", () => {
    expect(migration).toContain("WHERE j.id = _job_id AND j.status = 'processing'");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("INSERT INTO public.match_metrics");
    expect(migration).toContain("INSERT INTO public.match_features");
    expect(migration).toContain("status = 'processed', stage = 'done'");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.persist_demo_projection(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO service_role",
    );
  });
});