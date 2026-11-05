/**
 * Fase 3.5 — orchestration of one Coach send around the durable reservation, counting how
 * many times the provider is reached. The RPC client is an in-memory model of the SQL
 * functions (same outcomes, same fencing); the SQL itself is proven against real PostgreSQL
 * with independent sessions in coachReservations.integration.test.ts.
 */
import { describe, expect, it } from "vitest";

import { messageDigest, type RpcClient } from "@/lib/coach/coachReservation.server";
import { coachSendFlow, type FlowDeps, type Generated } from "@/lib/coach/coachSendFlow";
import { outcomeUncertain, CoachProviderFailure } from "@/lib/coach/coachProvider.server";

type Row = {
  user: string;
  player: string;
  conversation: string | null;
  sha: string;
  status: string;
  token: string | null;
  expires: number;
  attempts: number;
  pending: string | null;
  playerId: string | null;
  coachId: string | null;
};

/** In-memory model of supabase/migrations/20261105100000_coach_request_reservations.sql. */
function fakeDb(opts: { failComplete?: number; failPending?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const messages = new Map<string, { role: string; content: string; conversation: string }>();
  let completeFailures = opts.failComplete ?? 0;
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  const rpc: RpcClient = {
    rpc(fn, a) {
      const rid = a["p_request_id"] as string;
      const r = rows.get(rid);
      if (fn === "coach_claim_request") {
        const out = (outcome: string, extra: Partial<Record<string, unknown>> = {}) =>
          ok([
            {
              outcome,
              lease_token: null,
              conversation_id: null,
              player_message_id: null,
              coach_message_id: null,
              pending_reply: null,
              pending_context_type: null,
              ...extra,
            },
          ]);
        if (a["p_player_id"] === "foreign-player") return out("NOT_OWNER");
        if (!r) {
          const token = id();
          rows.set(rid, {
            user: a["p_user_id"] as string,
            player: a["p_player_id"] as string,
            conversation: (a["p_conversation_id"] as string) ?? null,
            sha: a["p_message_sha256"] as string,
            status: "PROCESSING",
            token,
            expires: Date.now() + 120_000,
            attempts: 1,
            pending: null,
            playerId: null,
            coachId: null,
          });
          return out("ACQUIRED", { lease_token: token, conversation_id: a["p_conversation_id"] });
        }
        if (r.user !== a["p_user_id"] || r.sha !== a["p_message_sha256"]) return out("CONFLICT");
        if (r.status === "COMPLETED")
          return out("REPLAY", {
            conversation_id: r.conversation,
            player_message_id: r.playerId,
            coach_message_id: r.coachId,
          });
        if (r.status === "PROCESSING" && r.expires > Date.now()) return out("IN_PROGRESS");
        if (r.status === "PROCESSING") {
          r.status = "OUTCOME_UNKNOWN";
          return out("OUTCOME_UNKNOWN");
        }
        if (r.status === "PERSIST_PENDING") {
          r.token = id();
          r.attempts++;
          return out("PERSIST_TAKEOVER", {
            lease_token: r.token,
            conversation_id: r.conversation,
            pending_reply: r.pending,
            pending_context_type: "ctx",
          });
        }
        if (r.status === "FAILED" && r.attempts < 5) {
          r.status = "PROCESSING";
          r.token = id();
          r.attempts++;
          r.expires = Date.now() + 120_000;
          return out("ACQUIRED", { lease_token: r.token });
        }
        if (r.status === "FAILED") return out("FAILED_FINAL");
        return out("OUTCOME_UNKNOWN");
      }
      if (fn === "coach_complete_request") {
        if (
          !r ||
          r.token !== a["p_lease_token"] ||
          !["PROCESSING", "PERSIST_PENDING", "OUTCOME_UNKNOWN"].includes(r.status)
        )
          return Promise.resolve({
            data: null,
            error: { code: "40001", message: "COACH_LEASE_LOST" },
          });
        if (completeFailures > 0) {
          completeFailures--;
          return Promise.resolve({
            data: null,
            error: { code: "08006", message: "connection lost" },
          });
        }
        r.conversation ??= id();
        messages.set(rid, {
          role: "player",
          content: a["p_question"] as string,
          conversation: r.conversation,
        });
        const coach = id();
        messages.set(coach, {
          role: "coach",
          content: a["p_reply"] as string,
          conversation: r.conversation,
        });
        Object.assign(r, {
          status: "COMPLETED",
          playerId: rid,
          coachId: coach,
          token: null,
          pending: null,
        });
        return ok([
          {
            conversation_id: r.conversation,
            player_message_id: rid,
            player_created_at: "t1",
            coach_message_id: coach,
            coach_created_at: "t2",
          },
        ]);
      }
      if (fn === "coach_fail_request") {
        if (!r || r.token !== a["p_lease_token"] || r.status !== "PROCESSING") return ok(false);
        r.status = a["p_status"] as string;
        if (r.status === "FAILED") r.token = null;
        return ok(true);
      }
      if (fn === "coach_persist_pending") {
        if (opts.failPending) return Promise.resolve({ data: null, error: { code: "08006" } });
        if (!r || r.token !== a["p_lease_token"]) return ok(false);
        Object.assign(r, { status: "PERSIST_PENDING", pending: a["p_reply"] });
        return ok(true);
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
  return { rpc, rows, messages };
}

const RID = "8f1c2d3e-0000-4000-8000-0000000000aa";

function deps(db: ReturnType<typeof fakeDb>, over: Partial<FlowDeps> & { reply?: Generated } = {}) {
  const calls = { provider: 0 };
  const d: FlowDeps = {
    rpc: db.rpc,
    requestId: RID,
    userId: "user-a",
    playerId: "player-a",
    conversationId: null,
    message: "Qual meu foco?",
    title: "Qual meu foco?",
    loadPair: async (p, c) => {
      const pm = db.messages.get(p);
      const cm = db.messages.get(c);
      return pm && cm
        ? {
            player: { id: p, role: "player", content: pm.content, createdAt: "t1" },
            coach: { id: c, role: "coach", content: cm.content, createdAt: "t2" },
          }
        : null;
    },
    withinRateLimit: async () => true,
    generate: async (mark) => {
      mark();
      calls.provider++;
      return (
        over.reply ?? {
          ok: true,
          content: "resposta",
          contextType: "ctx",
          provider: "openrouter",
          model: "openai/gpt-oss-20b",
        }
      );
    },
    log: () => {},
    ...over,
  };
  return { d, calls };
}

describe("Fase 3.5 — one provider call per request id", () => {
  it("3/17. replay after completion returns the stored pair with no new call", async () => {
    const db = fakeDb();
    const { d, calls } = deps(db);
    const first = await coachSendFlow(d);
    const second = await coachSendFlow(d);
    expect(first.ok && second.ok && second.replayed).toBe(true);
    expect(second.ok && second.coach.content).toBe("resposta");
    expect(calls.provider).toBe(1);
    expect(db.messages.size).toBe(2);
  });

  it("1/4. a concurrent duplicate while processing gets IN_PROGRESS and never calls", async () => {
    const db = fakeDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = deps(db, {
      generate: async (mark) => {
        mark();
        slowCalls++;
        await gate;
        return { ok: true, content: "r", contextType: "c", provider: "openrouter", model: "m" };
      },
    });
    let slowCalls = 0;
    const running = coachSendFlow(slow.d);
    const { d: dup, calls } = deps(db);
    await Promise.resolve();
    expect(await coachSendFlow(dup)).toEqual({ ok: false, error: "COACH_REQUEST_IN_PROGRESS" });
    release();
    expect((await running).ok).toBe(true);
    expect(slowCalls + calls.provider).toBe(1);
  });

  it("2/13. another account's id is a CONFLICT before the rate limit and the provider", async () => {
    const db = fakeDb();
    await coachSendFlow(deps(db).d);
    let rateChecked = false;
    const { d, calls } = deps(db, {
      userId: "user-b",
      playerId: "player-b",
      withinRateLimit: async () => ((rateChecked = true), true),
    });
    expect(await coachSendFlow(d)).toEqual({ ok: false, error: "COACH_REQUEST_ID_CONFLICT" });
    expect(rateChecked).toBe(false);
    expect(calls.provider).toBe(0);
  });

  it("16. the same id with another question conflicts (never answers the wrong text)", async () => {
    const db = fakeDb();
    await coachSendFlow(deps(db).d);
    const { d, calls } = deps(db, { message: "Outra pergunta" });
    expect(await coachSendFlow(d)).toEqual({ ok: false, error: "COACH_REQUEST_ID_CONFLICT" });
    expect(calls.provider).toBe(0);
  });

  it("a foreign conversation / player is refused before reserving", async () => {
    const db = fakeDb();
    const { d, calls } = deps(db, { playerId: "foreign-player" });
    expect(await coachSendFlow(d)).toEqual({ ok: false, error: "COACH_CONVERSATION_NOT_FOUND" });
    expect(db.rows.size).toBe(0);
    expect(calls.provider).toBe(0);
  });

  it("8. a certain provider failure → FAILED; the retry takes over and calls once more", async () => {
    const db = fakeDb();
    const failing = deps(db, {
      reply: { ok: false, error: "COACH_PROVIDER_RATE_LIMITED", uncertain: false },
    });
    expect(await coachSendFlow(failing.d)).toEqual({
      ok: false,
      error: "COACH_PROVIDER_RATE_LIMITED",
    });
    expect(db.rows.get(RID)!.status).toBe("FAILED");
    const retry = deps(db);
    expect((await coachSendFlow(retry.d)).ok).toBe(true);
    expect(failing.calls.provider + retry.calls.provider).toBe(2);
  });

  it("12. an uncertain outcome (timeout) is OUTCOME_UNKNOWN and is never retried", async () => {
    const db = fakeDb();
    const timeout = deps(db, {
      reply: { ok: false, error: "COACH_PROVIDER_TIMEOUT", uncertain: true },
    });
    expect(await coachSendFlow(timeout.d)).toEqual({ ok: false, error: "COACH_OUTCOME_UNKNOWN" });
    const retry = deps(db);
    expect(await coachSendFlow(retry.d)).toEqual({ ok: false, error: "COACH_OUTCOME_UNKNOWN" });
    expect(retry.calls.provider).toBe(0);
  });

  it("6. an expired PROCESSING lease is never a blind takeover", async () => {
    const db = fakeDb();
    // The first executor reaches the provider and never comes back (crash / hang).
    void coachSendFlow(deps(db, { generate: async () => new Promise<Generated>(() => {}) }).d);
    await new Promise((r) => setTimeout(r, 0));
    db.rows.get(RID)!.expires = Date.now() - 1;
    const retry = deps(db);
    expect(await coachSendFlow(retry.d)).toEqual({ ok: false, error: "COACH_OUTCOME_UNKNOWN" });
    expect(retry.calls.provider).toBe(0);
  });

  it("9/10/11. provider answered, write failed → PERSIST_PENDING; the retry persists with NO generation", async () => {
    const db = fakeDb({ failComplete: 1 });
    const first = deps(db);
    expect(await coachSendFlow(first.d)).toEqual({ ok: false, error: "COACH_PERSIST_FAILED" });
    expect(db.rows.get(RID)!.status).toBe("PERSIST_PENDING");
    const retry = deps(db);
    const done = await coachSendFlow(retry.d);
    expect(done.ok && done.coach.content).toBe("resposta");
    expect(first.calls.provider).toBe(1);
    expect(retry.calls.provider).toBe(0);
  });

  it("7. an executor whose lease was taken over cannot write", async () => {
    const db = fakeDb();
    const first = deps(db, {
      generate: async (mark) => {
        mark();
        // Meanwhile the reservation was failed and taken over by another executor.
        db.rows.get(RID)!.token = "someone-else";
        return { ok: true, content: "late", contextType: "c", provider: "openrouter", model: "m" };
      },
    });
    expect(await coachSendFlow(first.d)).toEqual({ ok: false, error: "COACH_REQUEST_IN_PROGRESS" });
    expect(db.messages.size).toBe(0);
  });

  it("an unexpected error after the provider was reached is OUTCOME_UNKNOWN; before it, FAILED", async () => {
    const after = fakeDb();
    await expect(
      coachSendFlow(
        deps(after, {
          generate: async (mark) => {
            mark();
            throw new Error("boom");
          },
        }).d,
      ),
    ).rejects.toThrow("boom");
    expect(after.rows.get(RID)!.status).toBe("OUTCOME_UNKNOWN");
    const before = fakeDb();
    await expect(
      coachSendFlow(
        deps(before, {
          generate: async () => {
            throw new Error("ctx");
          },
        }).d,
      ),
    ).rejects.toThrow("ctx");
    expect(before.rows.get(RID)!.status).toBe("FAILED");
  });

  it("the rate limit refuses after the claim and frees the id (FAILED, retryable)", async () => {
    const db = fakeDb();
    const { d, calls } = deps(db, { withinRateLimit: async () => false });
    expect(await coachSendFlow(d)).toEqual({ ok: false, error: "COACH_RATE_LIMITED" });
    expect(db.rows.get(RID)!.status).toBe("FAILED");
    expect(calls.provider).toBe(0);
  });

  it("the request is bound to the question by SHA-256", () => {
    expect(messageDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("Fase 3.5 — which provider failures are uncertain", () => {
  const F = (code: CoachProviderFailure["code"], status: number | null, transport: string | null) =>
    new CoachProviderFailure(code, status, [], transport);

  it("timeouts and connections lost after sending are uncertain; answered statuses are not", () => {
    expect(outcomeUncertain(F("COACH_PROVIDER_TIMEOUT", null, "TIMEOUT"))).toBe(true);
    expect(outcomeUncertain(F("COACH_PROVIDER_UNAVAILABLE", null, "TypeError: fetch failed"))).toBe(
      true,
    );
    expect(
      outcomeUncertain(F("COACH_PROVIDER_UNAVAILABLE", null, "TypeError: ECONNREFUSED: x")),
    ).toBe(false);
    expect(outcomeUncertain(F("COACH_PROVIDER_UNAVAILABLE", 503, null))).toBe(false);
    expect(outcomeUncertain(F("COACH_PROVIDER_RATE_LIMITED", 429, null))).toBe(false);
    expect(outcomeUncertain(F("COACH_PROVIDER_TRUNCATED", 200, null))).toBe(false);
    expect(outcomeUncertain(F("COACH_PROVIDER_NOT_CONFIGURED", null, null))).toBe(false);
  });
});
