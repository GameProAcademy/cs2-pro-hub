/**
 * Server-only flow behind the createPlayerUser server function.
 *
 * Kept free of TanStack Start so it can be exercised directly: the server-function
 * compiler rewrites createServerFn handlers in the test runtime, which would leave
 * authorisation ordering, Auth error mapping and audit rollback unprovable.
 *
 * Order is part of the contract: authorise -> validate -> Auth Admin createUser ->
 * mandatory audit (rollback of the account when the audit cannot be written).
 * Errors carry only safe codes; logs carry only the Auth error code/status.
 */
import { ADMIN_OPERATION_FAILED, classifyCreateUserError } from "@/lib/adminErrors";

export interface CreatePlayerInput {
  email: string;
  password: string;
  display_name?: string;
  nickname?: string;
  country?: string;
  locale?: string;
}

export interface AuthAdminError {
  code?: string | null | undefined;
  status?: number | null | undefined;
  message?: string | null | undefined;
}

export interface CreatePlayerDeps {
  /** Throws when the caller is not an active admin_master (resolveAdmin). */
  authorize: () => Promise<unknown>;
  createUser: (attributes: {
    email: string;
    password: string;
    email_confirm: true;
    user_metadata: Record<string, string | null>;
  }) => Promise<{ data: { user: { id: string } | null } | null; error: AuthAdminError | null }>;
  deleteUser: (userId: string) => Promise<unknown>;
  audit: (targetUserId: string, metadata: { email: string; role: "player" }) => Promise<void>;
  log?: (message: string, details: Record<string, unknown>) => void;
}

export async function createPlayerAccount(
  data: CreatePlayerInput,
  deps: CreatePlayerDeps,
): Promise<{ ok: true; userId: string }> {
  await deps.authorize();
  if (!data.email.includes("@") || data.password.length < 8) {
    throw new Error(ADMIN_OPERATION_FAILED);
  }

  const { data: created, error } = await deps.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      display_name: data.display_name ?? null,
      nickname: data.nickname ?? null,
      country: data.country ?? null,
      locale: data.locale ?? "en",
    },
  });
  if (error || !created?.user) {
    const safeCode = error ? classifyCreateUserError(error) : ADMIN_OPERATION_FAILED;
    // Safe log: error code/status only — never the password or e-mail.
    (deps.log ?? console.error)("admin.createPlayerUser failed", {
      code: error?.code ?? null,
      status: error?.status ?? null,
      safeCode,
    });
    throw new Error(safeCode);
  }

  const newUserId = created.user.id;

  // Auditing is mandatory. The Auth Admin API is not transactional, so when
  // the audit entry cannot be written the freshly created account is removed
  // again: no unaudited account may survive this operation.
  try {
    // Only player accounts can be created: this product has a single administrator.
    await deps.audit(newUserId, { email: data.email, role: "player" });
  } catch (auditError) {
    await deps.deleteUser(newUserId);
    throw auditError;
  }

  return { ok: true, userId: newUserId };
}
