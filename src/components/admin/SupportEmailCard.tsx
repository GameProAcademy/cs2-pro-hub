/**
 * Admin — support email integration status and ONE controlled test send.
 * Shows booleans and the public sender only; never a token.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { getSupportEmailStatus, sendSupportEmailTest } from "@/lib/support/emailAdmin.functions";
import { cn } from "@/lib/utils";

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-xs",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SupportEmailCard() {
  const t = useT();
  const status = useQuery({
    queryKey: ["admin", "support-email"],
    queryFn: () => getSupportEmailStatus(),
    staleTime: 60_000,
  });
  const test = useMutation({ mutationFn: () => sendSupportEmailTest() });
  const yes = t("adminEmail.yes");
  const no = t("adminEmail.no");
  const s = status.data;

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="support-email-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Mail className="size-3.5" aria-hidden />
        {t("adminEmail.title")}
      </h2>
      <div className="px-4 py-3">
        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : status.isError || !s ? (
          <p role="alert" className="text-sm text-destructive">
            {t("admin.error.generic")}
          </p>
        ) : (
          <>
            <Row
              label={t("adminEmail.configured")}
              value={s.configured ? yes : no}
              tone={s.configured ? "ok" : "bad"}
            />
            <Row
              label={t("adminEmail.sender")}
              value={s.senderAddress ? `${s.senderName ?? ""} <${s.senderAddress}>`.trim() : "—"}
            />
            <Row label={t("adminEmail.recipient")} value={s.recipient} />
            <Row
              label={t("adminEmail.senderAuthorized")}
              value={s.senderAuthorized == null ? "—" : s.senderAuthorized ? yes : no}
              tone={s.senderAuthorized == null ? "muted" : s.senderAuthorized ? "ok" : "bad"}
            />
            {s.checkReason ? (
              <Row label={t("adminEmail.reason")} value={s.checkReason} tone="bad" />
            ) : null}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("adminEmail.testHint")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => test.mutate()}
                disabled={!s.configured || !s.senderAuthorized || test.isPending}
              >
                {test.isPending ? (
                  <Loader2
                    className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : null}
                {t("adminEmail.sendTest")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void status.refetch()}
                disabled={status.isFetching}
              >
                {t("adminEmail.recheck")}
              </Button>
            </div>
            {test.data ? (
              <p
                role="status"
                className={cn(
                  "mt-2 text-xs",
                  test.data.outcome === "accepted" ? "text-success" : "text-warning",
                )}
                data-email-test-outcome={test.data.outcome}
              >
                {test.data.outcome === "accepted"
                  ? t("adminEmail.accepted")
                  : `${t("adminEmail.notSent")} (${test.data.reason ?? "—"})`}
              </p>
            ) : null}
            {test.isError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {t("admin.error.generic")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
