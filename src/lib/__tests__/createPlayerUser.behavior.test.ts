import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createPlayerAccount, type CreatePlayerDeps } from "@/lib/adminCreateUser.server";

/**
 * createPlayerUser flow: authorisation happens before the Auth Admin API is touched,
 * Auth failures map to safe codes, neither the error nor the log carries the password
 * or the e-mail, and an account whose audit entry fails is removed again.
 */

const PASSWORD = "Sup3r-Secret-Pass!";
const EMAIL = "novo.jogador@example.test";
const input = { email: EMAIL, password: PASSWORD, display_name: "Novo", nickname: "novo" };

function deps(over: Partial<CreatePlayerDeps> = {}) {
  const logged: unknown[] = [];
  const audits: unknown[] = [];
  const d = {
    authorize: vi.fn(async () => undefined),
    createUser: vi.fn(async () => ({ data: { user: { id: "new-user" } }, error: null })),
    deleteUser: vi.fn(async () => undefined),
    audit: vi.fn(async (target: string, metadata: unknown) => {
      audits.push({ target, metadata });
    }),
    log: (message: string, details: Record<string, unknown>) => logged.push({ message, details }),
    ...over,
  } as CreatePlayerDeps & Record<string, ReturnType<typeof vi.fn>>;
  return { d, logged, audits };
}

function assertNoSecrets(value: unknown) {
  const text = JSON.stringify(value) ?? "";
  expect(text).not.toContain(PASSWORD);
  expect(text).not.toContain(EMAIL);
}

describe("createPlayerAccount", () => {
  it("creates a player for an authorised admin and audits it without the password", async () => {
    const { d, audits } = deps();
    await expect(createPlayerAccount(input, d)).resolves.toEqual({ ok: true, userId: "new-user" });
    expect(d.authorize).toHaveBeenCalledTimes(1);
    expect(d.createUser).toHaveBeenCalledTimes(1);
    expect(audits).toEqual([{ target: "new-user", metadata: { email: EMAIL, role: "player" } }]);
    expect(JSON.stringify(audits)).not.toContain(PASSWORD);
  });

  it("blocks an unauthorised caller before the Auth Admin API is called", async () => {
    const { d } = deps({
      authorize: vi.fn(async () => {
        throw new Error("ADMIN_FORBIDDEN");
      }),
    });
    await expect(createPlayerAccount(input, d)).rejects.toThrow("ADMIN_FORBIDDEN");
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
  });

  it("maps a duplicate e-mail to ADMIN_EMAIL_EXISTS without leaking input", async () => {
    const { d, logged } = deps({
      createUser: vi.fn(async () => ({
        data: { user: null },
        error: {
          code: "email_exists",
          status: 422,
          message: `A user with ${EMAIL} has already been registered`,
        },
      })),
    });
    const err = (await createPlayerAccount(input, d).catch((e: Error) => e)) as Error;
    expect(err.message).toBe("ADMIN_EMAIL_EXISTS");
    assertNoSecrets(err.message);
    assertNoSecrets(logged);
    expect(d.audit).not.toHaveBeenCalled();
  });

  it("maps a policy-rejected password to ADMIN_WEAK_PASSWORD without leaking input", async () => {
    const { d, logged } = deps({
      createUser: vi.fn(async () => ({
        data: { user: null },
        error: {
          code: "weak_password",
          status: 422,
          message: "Password is known to be weak and easy to guess",
        },
      })),
    });
    const err = (await createPlayerAccount(input, d).catch((e: Error) => e)) as Error;
    expect(err.message).toBe("ADMIN_WEAK_PASSWORD");
    assertNoSecrets(err.message);
    assertNoSecrets(logged);
    expect(logged).toEqual([
      {
        message: "admin.createPlayerUser failed",
        details: { code: "weak_password", status: 422, safeCode: "ADMIN_WEAK_PASSWORD" },
      },
    ]);
  });

  it("keeps unknown Auth failures generic", async () => {
    const { d } = deps({
      createUser: vi.fn(async () => ({ data: null, error: { status: 500, message: "boom" } })),
    });
    await expect(createPlayerAccount(input, d)).rejects.toThrow("ADMIN_OPERATION_FAILED");
  });

  it("rejects malformed input after authorisation and before calling Auth", async () => {
    const { d } = deps();
    await expect(createPlayerAccount({ ...input, password: "short" }, d)).rejects.toThrow(
      "ADMIN_OPERATION_FAILED",
    );
    await expect(createPlayerAccount({ ...input, email: "no-at" }, d)).rejects.toThrow(
      "ADMIN_OPERATION_FAILED",
    );
    expect(d.authorize).toHaveBeenCalledTimes(2);
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("removes the created account when the audit entry cannot be written", async () => {
    const { d } = deps({
      audit: vi.fn(async () => {
        throw new Error("ADMIN_OPERATION_FAILED");
      }),
    });
    await expect(createPlayerAccount(input, d)).rejects.toThrow("ADMIN_OPERATION_FAILED");
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
  });
});

describe("createPlayerUser server function wiring", () => {
  const source = readFileSync(resolve("src/lib/admin.functions.ts"), "utf8");
  const start = source.indexOf("export const createPlayerUser");
  const body = source.slice(start, source.indexOf("export const", start + 1));

  it("is authenticated and authorises with resolveAdmin through createPlayerAccount", () => {
    expect(body).toContain(".middleware([requireSupabaseAuth])");
    expect(body).toContain("authorize: () => resolveAdmin(ctx)");
    expect(body).toContain('writeAuditLog(ctx, "USER_CREATED", targetUserId, metadata)');
    // The Auth Admin API is reached only through the injected dependencies.
    expect(body.match(/supabaseAdmin\.auth\.admin\.createUser\(/g)).toHaveLength(1);
    expect(body).toContain("return createPlayerAccount(data, {");
  });

  it("resolveAdmin fails closed on missing/inactive profile and non-master role", () => {
    const fn = source.slice(source.indexOf("async function resolveAdmin"));
    expect(fn).toMatch(
      /if \(!profile \|\| profile\.status !== "active"\) throw new Error\(FORBIDDEN\);/,
    );
    expect(fn).toMatch(/if \(master !== true\) throw new Error\(FORBIDDEN\);/);
  });
});
