/**
 * FASE 2.2.1D — job/connection lifecycle tests with a CONTROLLED DB MOCK.
 *
 * These are NOT integration tests against a real database: they exercise the
 * real `runFaceitSync` code path against a scripted fake of the Supabase query
 * builder, and are labelled as such. The database-level invariants (atomic
 * claim, global concurrency, stale recovery ceiling, unique idempotency
 * indexes) live in SQL and are verified by read-only inspection of the applied
 * migration, not here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------ scripted DB ------------------------------- */

interface Call {
  method: string;
  args: unknown[];
}

type Resolver = (table: string, calls: Call[]) => unknown;

let resolver: Resolver = () => ({ data: null, error: null });
const performed: Array<{ table: string; calls: Call[] }> = [];

function builder(table: string) {
  const calls: Call[] = [];
  const record = { table, calls };
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "upsert",
    "eq",
    "in",
    "not",
    "order",
    "limit",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  const settle = () => {
    performed.push(record);
    const result = resolver(table, calls);
    return Promise.resolve(result ?? { data: null, error: null });
  };
  chain["maybeSingle"] = settle;
  chain["single"] = settle;
  chain["then"] = (onFulfilled: (value: unknown) => unknown, onRejected?: () => unknown) =>
    settle().then(onFulfilled, onRejected);
  return chain;
}

const fakeDb = { from: (table: string) => builder(table) };

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeDb }));

const clientGet = vi.fn(async () => ({ items: [] }));
vi.mock("../faceit.runtime.server", () => ({
  faceitRuntime: () => ({
    client: {
      get: clientGet,
      get requestCount() {
        return clientGet.mock.calls.length;
      },
      remainingCalls: 10,
    },
    config: {
      gameId: "cs2",
      syncMatchLimit: 20,
      syncMaxPages: 2,
      timeoutMs: 1000,
      maxRetries: 1,
      apiKey: "k",
      baseUrl: "https://open.faceit.com/data/v4",
    },
  }),
}));

const { runFaceitSync } = await import("../faceit.sync.server");

function hasCall(calls: Call[], method: string, arg0?: unknown): boolean {
  return calls.some(
    (call) => call.method === method && (arg0 === undefined || call.args[0] === arg0),
  );
}

/** Builds a resolver where the connection status can change mid-flight. */
function script(statusSequence: string[]) {
  let statusReads = 0;
  return (table: string, calls: Call[]): unknown => {
    if (table === "player_connections") {
      const isRead = hasCall(calls, "select") && !hasCall(calls, "update");
      if (isRead) {
        const status = statusSequence[Math.min(statusReads, statusSequence.length - 1)]!;
        statusReads += 1;
        return {
          data: {
            id: "conn-1",
            external_id: "faceit-player-1",
            status,
            metadata: { synced_at: new Date().toISOString() },
            last_sync_at: null,
          },
          error: null,
        };
      }
      // Guarded update: it only "hits" a row while the status is still connected.
      const guarded = calls.some(
        (call) => call.method === "eq" && call.args[0] === "status" && call.args[1] === "connected",
      );
      const stillConnected = statusSequence[statusSequence.length - 1] === "connected";
      return { data: guarded && !stillConnected ? [] : [{ id: "conn-1" }], error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  performed.length = 0;
  clientGet.mockClear();
});

describe("FASE 2.2.1D — TESTE M: disconnect durante o processamento", () => {
  it("não ressuscita a conexão e protege o update final com status = connected", async () => {
    // Connected when the job starts, disconnected by the time it finishes.
    resolver = script(["connected", "disconnected"]);

    const counters = await runFaceitSync("player-1", "conn-1", "incremental");
    expect(counters.matchesFound).toBe(0);

    const updates = performed.filter(
      (entry) => entry.table === "player_connections" && hasCall(entry.calls, "update"),
    );
    // Either the pre-check stopped the write, or the write was status-guarded.
    for (const update of updates) {
      expect(
        update.calls.some(
          (call) =>
            call.method === "eq" && call.args[0] === "status" && call.args[1] === "connected",
        ),
      ).toBe(true);
    }
    const successWrites = updates.filter((update) =>
      update.calls.some(
        (call) =>
          call.method === "update" &&
          (call.args[0] as Record<string, unknown>)["last_sync_status"] === "success",
      ),
    );
    // The disconnect won the race: no unguarded success write happened.
    expect(successWrites.length).toBe(0);
  });

  it("uma conexão ainda ativa recebe o resultado do sync normalmente", async () => {
    resolver = script(["connected", "connected"]);

    await runFaceitSync("player-1", "conn-1", "incremental");

    const successWrites = performed.filter(
      (entry) =>
        entry.table === "player_connections" &&
        entry.calls.some(
          (call) =>
            call.method === "update" &&
            (call.args[0] as Record<string, unknown>)["last_sync_status"] === "success",
        ),
    );
    expect(successWrites.length).toBe(1);
    expect(
      successWrites[0]!.calls.some(
        (call) => call.method === "eq" && call.args[0] === "status" && call.args[1] === "connected",
      ),
    ).toBe(true);
  });

  it("um sync de conexão já desconectada nunca começa", async () => {
    resolver = script(["disconnected"]);
    await expect(runFaceitSync("player-1", "conn-1", "incremental")).rejects.toMatchObject({
      code: "FACEIT_NOT_CONNECTED",
    });
    expect(clientGet).not.toHaveBeenCalled();
  });
});
