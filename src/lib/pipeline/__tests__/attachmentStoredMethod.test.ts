import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyIdentityRpcError,
  resolvePlayerAttachment,
  STORED_ATTACHMENT_METHODS,
  storedAttachmentMethod,
  type DemoParticipant,
} from "@/lib/pipeline/attachment";

/**
 * D11 (production, 2026-10-21, job 921b55cf / match 95186f3f): every manual selection failed
 * with "Não foi possível salvar sua escolha". declareDemoPlayer wrote the resolver's method
 * `manual_user_selection` into demo_jobs.attachment_method, and the check constraint
 * demo_jobs_attachment_method_check refused it (SQLSTATE 23514, reproduced in a rolled-back
 * transaction on production); the server function collapsed it into JOB_REQUEUE_FAILED.
 */

const PARTICIPANTS: DemoParticipant[] = [
  {
    participantKey: "76561197960690195",
    steamId: "76561197960690195",
    nickname: "FalleN",
    team: null,
  },
  {
    participantKey: "76561198014259134",
    steamId: "76561198014259134",
    nickname: "FL4MUS",
    team: null,
  },
];

function constraintValues(): string[] {
  // The last migration that (re)defines the constraint is the one in force.
  const dir = resolve("supabase/migrations");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) =>
      readFileSync(resolve(dir, name), "utf8").includes("demo_jobs_attachment_method_check"),
    );
  const sql = readFileSync(resolve(dir, files.at(-1)!), "utf8");
  const start = sql.lastIndexOf("demo_jobs_attachment_method_check");
  const clause = sql.slice(start, sql.indexOf(";", start));
  return [...clause.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

describe("stored attachment method (D11)", () => {
  it("is exactly the vocabulary the database constraint accepts", () => {
    expect(constraintValues().sort()).toEqual([...STORED_ATTACHMENT_METHODS].sort());
  });

  it("stores a manual participant selection as self_declared_player", () => {
    const outcome = resolvePlayerAttachment({
      participants: PARTICIPANTS,
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "participant", participantKey: "76561197960690195" },
    });
    expect(outcome.state).toBe("attached");
    expect(outcome.method).toBe("manual_user_selection");
    expect(storedAttachmentMethod(outcome.method, "participant")).toBe("self_declared_player");
  });

  it("stores a nickname that resolved to one participant as self_declared_nickname", () => {
    const outcome = resolvePlayerAttachment({
      participants: PARTICIPANTS,
      hasProfile: true,
      profileSteamId: null,
      declaration: { kind: "nickname", nickname: "fallen" },
    });
    expect(outcome.state).toBe("attached");
    expect(storedAttachmentMethod(outcome.method, "nickname")).toBe("self_declared_nickname");
  });

  it("keeps Steam confirmation and an absent method unchanged", () => {
    expect(storedAttachmentMethod("steam_id_confirmed", null)).toBe("steam_id_confirmed");
    expect(storedAttachmentMethod(null, "participant")).toBeNull();
  });

  it("fails closed for a method the database cannot store", () => {
    expect(() => storedAttachmentMethod("faceit_player_id_confirmed", null)).toThrow(
      "IDENTITY_METHOD_NOT_STORABLE",
    );
    expect(() => storedAttachmentMethod("manual_user_selection", null)).toThrow(
      "IDENTITY_METHOD_NOT_STORABLE",
    );
  });

  it("every attached resolver outcome maps into the stored vocabulary", () => {
    for (const declaration of [
      { kind: "participant" as const, participantKey: "76561198014259134" },
      { kind: "nickname" as const, nickname: "FL4MUS" },
    ]) {
      const outcome = resolvePlayerAttachment({
        participants: PARTICIPANTS,
        hasProfile: true,
        profileSteamId: null,
        declaration,
      });
      const stored = storedAttachmentMethod(outcome.method, declaration.kind);
      expect(STORED_ATTACHMENT_METHODS).toContain(stored);
    }
    const steam = resolvePlayerAttachment({
      participants: PARTICIPANTS,
      hasProfile: true,
      profileSteamId: "76561197960690195",
      declaration: null,
    });
    expect(STORED_ATTACHMENT_METHODS).toContain(storedAttachmentMethod(steam.method, null));
  });
});

describe("identity RPC error classification (D11)", () => {
  it("passes through the RPC's own safe tokens", () => {
    for (const token of [
      "IDENTITY_DECISION_STALE",
      "IDENTITY_DECISION_CONFLICT",
      "PARTICIPANT_NOT_IN_MATCH",
      "CANONICAL_MATCH_MISMATCH",
      "MATCH_NOT_ANALYSED",
      "PLAYER_PROFILE_NOT_FOUND",
      "JOB_NOT_FOUND",
    ]) {
      expect(classifyIdentityRpcError({ code: "P0001", message: token }).code).toBe(token);
    }
  });

  it("reports a constraint violation by name only, never the row", () => {
    const message =
      'new row for relation "demo_jobs" violates check constraint "demo_jobs_attachment_method_check" ' +
      "Failing row contains (921b55cf, 76561197960690195, FalleN, 348b6f66/11e1d2ff.dem)";
    const failure = classifyIdentityRpcError({ code: "23514", message });
    expect(failure).toEqual({
      code: "IDENTITY_DECISION_INVALID",
      constraint: "demo_jobs_attachment_method_check",
    });
    const text = JSON.stringify(failure);
    for (const secret of ["76561197960690195", "FalleN", ".dem", "348b6f66"])
      expect(text).not.toContain(secret);
  });

  it("collapses anything else to JOB_REQUEUE_FAILED", () => {
    expect(classifyIdentityRpcError({ code: "08006", message: "connection lost" })).toEqual({
      code: "JOB_REQUEUE_FAILED",
      constraint: null,
    });
  });
});

describe("D11 wiring", () => {
  const identity = readFileSync(resolve("src/lib/pipeline-identity.functions.ts"), "utf8");
  const jobs = readFileSync(resolve("src/lib/pipeline/jobs.server.ts"), "utf8");

  it("declareDemoPlayer stores the mapped method and logs only safe diagnostics", () => {
    const start = identity.indexOf("export const declareDemoPlayer");
    const body = identity.slice(start, identity.indexOf("export const", start + 1));
    expect(body).toContain("method: storedAttachmentMethod(outcome.method, declaration.kind)");
    expect(body).toContain("classifyIdentityRpcError(requeueError)");
    expect(body).not.toMatch(/console\.error\([^)]*requeueError\.message/);
    expect(body).toContain('throw new Error("JOB_NOT_EDITABLE")');
    // Ownership is still read under the user's RLS before the service-role RPC.
    expect(body.indexOf('.from("demo_jobs")')).toBeLessThan(body.indexOf("supabaseAdmin.rpc"));
  });

  it("processJob stores the mapped method too", () => {
    expect(jobs).toContain(
      "attachment_method: storedAttachmentMethod(attachment.method, declaration?.kind ?? null)",
    );
    expect(jobs).not.toMatch(/attachment_method: attachment\.method,/);
  });
});
