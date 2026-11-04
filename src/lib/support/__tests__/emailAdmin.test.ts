/**
 * Admin support-email diagnostics: admin-only, audited, one test message per 10-minute
 * window, booleans and the public sender only (never a token).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictionaries, type Locale } from "@/i18n/config";
import { guidancePtBR } from "@/i18n/locales/guidance/pt-BR";

const source = readFileSync(resolve("src/lib/support/emailAdmin.functions.ts"), "utf8");
const card = readFileSync(resolve("src/components/admin/SupportEmailCard.tsx"), "utf8");

describe("support email admin diagnostics", () => {
  it("both server functions require auth and an admin master", () => {
    expect(source.match(/\.middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(2);
    expect(source.match(/await resolveAdmin\(context as Ctx\)/g)).toHaveLength(2);
  });

  it("the test send is audited first and idempotent per 10-minute window", () => {
    const audit = source.indexOf('writeAuditLog(context as Ctx, "SUPPORT_EMAIL_TEST"');
    const send = source.indexOf("await sendTransactionalEmail(");
    expect(audit).toBeGreaterThan(0);
    expect(audit).toBeLessThan(send);
    expect(source).toContain("Math.floor(Date.now() / (10 * 60_000))");
    expect(source).toContain("idempotencyKey: windowKey");
    expect(source).toContain("to: SUPPORT_REPORT_RECIPIENT");
  });

  it("never returns or logs a token", () => {
    expect(source).not.toMatch(/HOSTINGER_MAIL_API_TOKEN|config\.token|Authorization/);
    expect(card).not.toMatch(/\.token\b|HOSTINGER_MAIL_API_TOKEN/);
  });

  it("the test button stays disabled until the sender is authorized", () => {
    expect(card).toContain("disabled={!s.configured || !s.senderAuthorized || test.isPending}");
  });

  it("copy exists in the 5 locales and never claims delivery", () => {
    for (const locale of ["pt-BR", "en", "es", "fr", "pt-PT"] as Locale[]) {
      const dict = dictionaries[locale] as Record<string, string>;
      for (const key of Object.keys(guidancePtBR).filter((k) => k.startsWith("adminEmail."))) {
        expect(dict[key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
    expect(guidancePtBR["adminEmail.accepted"]).toContain("Confirme o recebimento");
  });
});
