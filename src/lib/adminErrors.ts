/** Maps Auth Admin API failures to safe, user-facing codes (never echoes input). */
export const ADMIN_WEAK_PASSWORD = "ADMIN_WEAK_PASSWORD";
export const ADMIN_EMAIL_EXISTS = "ADMIN_EMAIL_EXISTS";
export const ADMIN_OPERATION_FAILED = "ADMIN_OPERATION_FAILED";

export function classifyCreateUserError(error: {
  code?: string | null | undefined;
  message?: string | null | undefined;
  status?: number | null | undefined;
}): string {
  const code = (error.code ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  if (code === "weak_password" || message.includes("weak") || message.includes("easy to guess"))
    return ADMIN_WEAK_PASSWORD;
  if (code === "email_exists" || code === "user_already_exists" || message.includes("already been registered"))
    return ADMIN_EMAIL_EXISTS;
  return ADMIN_OPERATION_FAILED;
}

export function createUserErrorKey(
  message: string | undefined,
): "admin.error.weakPassword" | "admin.error.emailExists" | "admin.error.generic" {
  if (message?.includes(ADMIN_WEAK_PASSWORD)) return "admin.error.weakPassword";
  if (message?.includes(ADMIN_EMAIL_EXISTS)) return "admin.error.emailExists";
  return "admin.error.generic";
}
