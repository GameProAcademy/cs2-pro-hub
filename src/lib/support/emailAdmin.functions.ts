/**
 * Admin-only diagnostics for the support email integration (Hostinger Mail API).
 *
 * - getSupportEmailStatus: configuration booleans, the public sender address and whether the
 *   token's scope includes that sender (GET /api/v1/me). Sends nothing; never returns a token.
 * - sendSupportEmailTest: ONE audited test message to the fixed support inbox, at most one
 *   per 10-minute window (persistent idempotency), so a real authorized send can be verified
 *   without a fake problem report and without repeated messages to a real inbox.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAdmin, writeAuditLog, type Ctx } from "@/lib/admin.functions";

export interface SupportEmailStatus {
  configured: boolean;
  provider: string;
  tokenConfigured: boolean;
  senderConfigured: boolean;
  senderAddress: string | null;
  senderName: string | null;
  recipient: string;
  /** null when not configured or not checked; true/false from the provider's /me answer. */
  senderAuthorized: boolean | null;
  /** Safe reason code when the check failed (never a provider message). */
  checkReason: string | null;
}

export const getSupportEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportEmailStatus> => {
    await resolveAdmin(context as Ctx);
    const { emailConfigStatus, emailSenderIdentity, resolveEmailConfig } =
      await import("@/lib/email/email.config.server");
    const { resolveSenderMailbox } = await import("@/lib/email/email.transport.server");
    const { SUPPORT_REPORT_RECIPIENT } = await import("@/lib/support/problemReport");
    const status = emailConfigStatus();
    const config = resolveEmailConfig();
    let senderAuthorized: boolean | null = null;
    let checkReason: string | null = null;
    if (config) {
      try {
        const result = await resolveSenderMailbox(config);
        senderAuthorized = result.ok;
        if (!result.ok && result.outcome.status === "failed") checkReason = result.outcome.reason;
      } catch {
        checkReason = "EMAIL_TRANSPORT_ERROR";
      }
    }
    return {
      configured: status.state === "configured",
      provider: status.provider,
      tokenConfigured: status.tokenConfigured,
      senderConfigured: status.senderConfigured,
      senderAddress: status.senderAddress,
      senderName: emailSenderIdentity()?.name ?? null,
      recipient: SUPPORT_REPORT_RECIPIENT,
      senderAuthorized,
      checkReason,
    };
  });

export interface SupportEmailTestResult {
  outcome: "accepted" | "skipped" | "failed";
  reason: string | null;
  windowKey: string;
}

export const sendSupportEmailTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportEmailTestResult> => {
    await resolveAdmin(context as Ctx);
    const { SUPPORT_REPORT_RECIPIENT } = await import("@/lib/support/problemReport");
    const { sendTransactionalEmail } = await import("@/lib/email/email.dispatch.server");
    const window = Math.floor(Date.now() / (10 * 60_000));
    const windowKey = `support_email_test:${window}`;
    const when = new Date().toISOString();
    // Audit first: an unaudited admin action is not allowed (writeAuditLog throws).
    await writeAuditLog(context as Ctx, "SUPPORT_EMAIL_TEST", null, { windowKey });
    const outcome = await sendTransactionalEmail({
      to: SUPPORT_REPORT_RECIPIENT,
      subject: "[CS2 PRO] Teste da integração de e-mail de suporte",
      text:
        `Mensagem de teste enviada pelo painel administrativo do CS2 PRO em ${when} (UTC).\n` +
        `Se ela chegou a ${SUPPORT_REPORT_RECIPIENT}, os relatórios "Reportar problema" ` +
        `também chegarão.\nNenhuma ação é necessária.`,
      html:
        `<p>Mensagem de teste enviada pelo painel administrativo do CS2 PRO em <code>${when}</code> (UTC).</p>` +
        `<p>Se ela chegou a ${SUPPORT_REPORT_RECIPIENT}, os relatórios "Reportar problema" também chegarão.</p>` +
        `<p>Nenhuma ação é necessária.</p>`,
      idempotencyKey: windowKey,
      kind: "support_report",
      userId: context.userId,
      locale: "pt-BR",
    });
    console.info(
      `[support] event=email_test outcome=${outcome.status}` +
        (outcome.status === "failed" || outcome.status === "skipped"
          ? ` reason=${outcome.reason}`
          : ""),
    );
    return {
      outcome: outcome.status,
      reason: outcome.status === "accepted" ? null : outcome.reason,
      windowKey,
    };
  });
