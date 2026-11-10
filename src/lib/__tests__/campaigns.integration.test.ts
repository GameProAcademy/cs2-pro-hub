/**
 * Fase 4.1 — Admin Notification Center SQL against a disposable PostgreSQL with independent
 * sessions (scripts/campaigns-harness.py), the Fase 4 notification guarantees re-proven after
 * the new notification_ingest (scripts/notifications-harness.py with the later migrations),
 * and mutation tests: each mutant weakens one guarantee and the harness must catch it.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20261106120000_admin_notification_center.sql";

type HarnessResult = { checks: Record<string, boolean>; failures: string[]; teardown: boolean };

function harness(script: string, extra: Record<string, string> = {}): HarnessResult {
  const output = execFileSync("python3", [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 280_000,
    env: { PATH: process.env["PATH"], HOME: "/tmp", ...extra },
  });
  return JSON.parse(output.trim()) as HarnessResult;
}

function mutant(replacements: Array<[string, string]>): HarnessResult {
  let source = readFileSync(MIGRATION, "utf8");
  for (const [from, to] of replacements) {
    expect(source.includes(from), from).toBe(true);
    source = source.split(from).join(to);
  }
  const dir = mkdtempSync(join(tmpdir(), "campaigns-mutant-"));
  chmodSync(dir, 0o755);
  const file = join(dir, "mutant.sql");
  writeFileSync(file, source, { mode: 0o644 });
  try {
    return harness("scripts/campaigns-harness.py", { CAMPAIGNS_MIGRATION: file });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Fase 4.1 against disposable PostgreSQL", () => {
  it("permissions, segments, state machine, sending, fencing, consent, frequency, audit", () => {
    const result = harness("scripts/campaigns-harness.py");
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(52);
    expect(result.teardown).toBe(true);
  }, 300_000);

  it("every Fase 4 notification guarantee still holds after the new notification_ingest", () => {
    const result = harness("scripts/notifications-harness.py", {
      NOTIFICATIONS_LATER_MIGRATIONS: "1",
    });
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.checks).length).toBeGreaterThanOrEqual(30);
  }, 300_000);

  it.each<[string, Array<[string, string]>, string]>([
    [
      "no fencing",
      [
        [
          "WHERE x.id = p_id AND x.status = 'SENDING' AND x.lease_token = p_token;\n    IF NOT FOUND THEN RETURN 'LEASE_LOST'; END IF;",
          "WHERE x.id = p_id;\n    IF NOT FOUND THEN RETURN 'LEASE_LOST'; END IF;",
        ],
        [
          "WHERE x.id = p_id AND x.status = 'SENDING' AND x.lease_token = p_token;\n    GET DIAGNOSTICS",
          "WHERE x.id = p_id;\n    GET DIAGNOSTICS",
        ],
      ],
      "stale_token_cannot_send",
    ],
    [
      "commercial audience without consent",
      [["AND (p_kind <> 'commercial' OR coalesce(", "AND (true OR coalesce("]],
      "commercial_only_consented",
    ],
    [
      "ingest accepts marketing without consent",
      [
        [
          "ELSIF v_category = 'marketing' AND (pref.user_id IS NULL OR NOT pref.marketing_consent) THEN",
          "ELSIF false THEN",
        ],
      ],
      "ingest_refuses_marketing_without_consent",
    ],
    ["no weekly cap", [["IF v_week >= 2 THEN", "IF v_week >= 99 THEN"]], "weekly_frequency_cap"],
    [
      "admins may send",
      [["WHEN 'schedule'   THEN v_need := 2;", "WHEN 'schedule'   THEN v_need := 1;"]],
      "admin_cannot_approve_or_send",
    ],
    [
      "no audience confirmation",
      [
        [
          "IF (p_args->>'confirm_audience') IS NULL OR (p_args->>'confirm_audience')::integer <> v_audience THEN",
          "IF false THEN",
        ],
      ],
      "mass_send_needs_exact_confirmation",
    ],
    [
      "test send to any player",
      [["IF v_to <> auth.uid() AND NOT public.is_staff(v_to) THEN", "IF false THEN"]],
      "test_send_only_to_staff",
    ],
    [
      "edits keep the approval",
      [
        [
          "SET title = EXCLUDED.title, body = EXCLUDED.body, approved_at = NULL, approved_by = NULL,",
          "SET title = EXCLUDED.title, body = EXCLUDED.body,",
        ],
      ],
      "edit_withdraws_approval",
    ],
    [
      "texts readable by everyone",
      [["OR (approved_at IS NOT NULL AND EXISTS (", "OR (true OR EXISTS ("]],
      "player_cannot_read_campaigns",
    ],
  ])(
    "mutant '%s' is caught",
    (_name, replacements, expected) => {
      expect(mutant(replacements).failures).toContain(expected);
    },
    300_000,
  );
});
