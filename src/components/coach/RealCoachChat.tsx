/**
 * Real AI Coach chat (authenticated). Replies come only from `sendCoachMessage`
 * (Lovable AI Gateway, grounded on the player's own official metrics); there is
 * no local or fixed reply. Text is rendered as React text nodes, never as HTML.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, RotateCcw, Send, Sparkles, User } from "lucide-react";
import { Fragment, useRef, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { COACH_STATE_KEY, coachErrorKey } from "@/components/coach/coachErrors";
import {
  getCoachState,
  sendCoachMessage,
  type CoachErrorCode,
  type CoachMessageView,
  type CoachState,
} from "@/lib/coach.functions";
import { COACH_MAX_MESSAGE_CHARS } from "@/lib/coach/coachContext";
import { cn } from "@/lib/utils";

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

/** Minimal, safe rendering of the model's light markdown (headings, bullets, bold). */
export function CoachText({ content }: { content: string }) {
  return (
    <div className="space-y-1.5">
      {content.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading)
          return (
            <p key={i} className="pt-1 font-semibold text-foreground">
              {inline(heading[1]!)}
            </p>
          );
        const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
        if (bullet)
          return (
            <p key={i} className="pl-4 -indent-3">
              • {inline(bullet[1]!)}
            </p>
          );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

function Bubble({
  message,
  aiLabel,
  intlTag,
}: {
  message: CoachMessageView;
  aiLabel: string;
  intlTag: string;
}) {
  const isCoach = message.role === "coach";
  const time = new Date(message.createdAt).toLocaleString(intlTag, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={cn("flex gap-3", isCoach ? "justify-start" : "justify-end")}>
      {isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Bot className="size-4" aria-hidden />
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-lg border px-4 py-3 text-sm leading-relaxed",
          isCoach
            ? "border-border bg-card text-foreground"
            : "border-primary/25 bg-primary/10 text-foreground",
        )}
      >
        {isCoach ? (
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            {aiLabel}
          </p>
        ) : null}
        {isCoach ? (
          <CoachText content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">{time}</p>
      </div>
      {!isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
          <User className="size-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

export function RealCoachChat({ className }: { className?: string | undefined }) {
  const { t, intlTag, locale } = useI18n();
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: COACH_STATE_KEY, queryFn: () => getCoachState() });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<CoachErrorCode | null>(null);
  const [fresh, setFresh] = useState(false);
  const sending = useRef(false);

  if (state.isPending) return <LoadingState className={className} />;
  if (state.isError || !state.data)
    return (
      <ErrorState
        className={className}
        title={t("real.error.title")}
        description={t("real.error.description")}
        onRetry={() => void state.refetch()}
      />
    );
  const data: CoachState = state.data;
  if (data.player !== "OK")
    return (
      <EmptyState
        className={className}
        title={t("coach.title")}
        description={t("real.aicoach.noPlayer")}
      />
    );
  if (data.dataState === "NO_MATCHES")
    return (
      <EmptyState
        className={className}
        title={t("coach.title")}
        description={t("real.aicoach.noData")}
      />
    );

  const messages = fresh ? [] : data.messages;
  const conversationId = fresh ? null : data.conversationId;

  const send = async () => {
    const message = draft.trim();
    if (!message || sending.current) return; // anti double-send
    sending.current = true;
    setPending(message);
    setError(null);
    try {
      const result = await sendCoachMessage({ data: { message, locale, conversationId } });
      if (result.ok) {
        setDraft("");
        setFresh(false);
        queryClient.setQueryData<CoachState>(COACH_STATE_KEY, (prev) =>
          prev
            ? {
                ...prev,
                conversationId: result.conversationId,
                messages: [...(conversationId ? prev.messages : []), result.player, result.coach],
                remainingThisHour: Math.max(0, prev.remainingThisHour - 1),
              }
            : prev,
        );
      } else {
        setError(result.error); // the draft is kept so the player can retry
      }
    } catch {
      setError("COACH_INTERNAL");
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p className="text-[11px] leading-snug text-muted-foreground">
          {t("real.aicoach.disclaimer")}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending !== null || messages.length === 0}
          onClick={() => {
            setFresh(true);
            setError(null);
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          {t("real.aicoach.newConversation")}
        </Button>
      </div>
      {data.dataState === "INSUFFICIENT_SAMPLE" ? (
        <p className="border-b border-warning/20 bg-warning/8 px-4 py-2 text-xs text-muted-foreground">
          {t("real.aicoach.insufficient")}
        </p>
      ) : null}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {messages.length === 0 && pending === null ? (
          <EmptyState
            title={t("real.aicoach.emptyTitle")}
            description={t("real.aicoach.emptyDescription")}
            icon={<Sparkles className="size-5" aria-hidden />}
          />
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} aiLabel={t("real.aicoach.aiLabel")} intlTag={intlTag} />
        ))}
        {pending !== null ? (
          <>
            <div className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm opacity-70">
                {pending}
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{t("coach.thinking")}</p>
          </>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm"
          >
            <p className="font-medium text-destructive">{t("coach.errorTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t(coachErrorKey(error))}</p>
            {error === "COACH_CONVERSATION_NOT_FOUND" ? null : (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void send()}
                disabled={!draft.trim()}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t("real.aicoach.retry")}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            maxLength={COACH_MAX_MESSAGE_CHARS}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("coach.placeholder")}
            disabled={pending !== null}
            rows={2}
            className="min-h-[3rem] resize-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t("coach.sendAria")}
            disabled={pending !== null || !draft.trim() || data.remainingThisHour === 0}
          >
            <Send className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{t("real.aicoach.remaining").replace("{n}", String(data.remainingThisHour))}</span>
          <span>
            {draft.length}/{COACH_MAX_MESSAGE_CHARS}
          </span>
        </p>
      </form>
    </div>
  );
}
