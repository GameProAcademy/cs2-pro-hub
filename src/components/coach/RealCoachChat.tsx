/**
 * Real AI Coach chat (authenticated). Replies come only from `sendCoachMessage`
 * (OpenRouter, grounded on the player's own data through coach-context-v1); there is
 * no local or fixed reply. Text is rendered as React text nodes, never as HTML.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Plus, RotateCcw, Send, User } from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { COACH_STATE_KEY, coachErrorKey } from "@/components/coach/coachErrors";

const FRESH_ID_AFTER = new Set<string>([
  "COACH_OUTCOME_UNKNOWN",
  "COACH_REQUEST_ID_CONFLICT",
  "COACH_REQUEST_FAILED",
]);
import {
  ConversationMenu,
  COACH_CONVERSATIONS_KEY,
  COACH_PREFERENCES_KEY,
  DeleteConversationButton,
  PersonalizeButton,
  PreferencesPanel,
  SuggestedQuestions,
} from "@/components/coach/CoachControls";
import {
  getCoachState,
  sendCoachMessage,
  type CoachErrorCode,
  type CoachMessageView,
  type CoachState,
} from "@/lib/coach.functions";
import { COACH_MAX_MESSAGE_CHARS } from "@/lib/coach/coachContext";
import { coachScreenFrom } from "@/lib/coach/coachScreen";
import { getCoachConversation, getCoachPreferences } from "@/lib/coachSession.functions";
import { coachBlocks, inlineParts } from "@/lib/coach/coachText";
import { cn } from "@/lib/utils";
import { CoachMapContext } from "@/components/cs2/BriefingKit";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { coachSectionKind, coachTokens, type CoachSectionKind } from "@/lib/coach/coachSections";
import { MapEmblem, SideLogo, WeaponArt } from "@/components/cs2/Cs2Art";

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, i) =>
        part.kind === "bold" ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === "italic" ? (
          <em key={i}>{part.text}</em>
        ) : part.kind === "code" ? (
          <code
            key={i}
            className="rounded border border-border bg-elevated px-1 py-0.5 font-mono text-xs text-foreground"
          >
            {part.text}
          </code>
        ) : (
          <Fragment key={i}>
            {coachTokens(part.text).map((p, j) =>
              p.kind === "number" ? (
                <span
                  key={j}
                  className="font-mono font-semibold tabular-nums text-foreground"
                  data-coach-number
                >
                  {p.text}
                </span>
              ) : p.kind === "map" ? (
                <span key={j} className="inline-flex items-baseline gap-1" data-coach-map={p.map}>
                  <MapEmblem map={p.map} className="size-4 self-center" />
                  <span className="font-semibold text-foreground">{p.text}</span>
                </span>
              ) : p.kind === "weapon" ? (
                <span
                  key={j}
                  className="inline-flex items-baseline gap-1"
                  data-coach-weapon={p.weapon}
                >
                  <span className="font-semibold text-foreground">{p.text}</span>
                  <WeaponArt
                    weapon={p.weapon}
                    className="h-3 w-7 self-center text-muted-foreground"
                  />
                </span>
              ) : p.kind === "side" ? (
                <span
                  key={j}
                  className={cn(
                    "inline-flex items-baseline gap-1 font-semibold",
                    p.side === "CT" ? "text-side-ct" : "text-side-t",
                  )}
                  data-coach-side={p.side}
                >
                  <SideLogo side={p.side} className="size-3.5 self-center" />
                  {p.text}
                </span>
              ) : (
                <Fragment key={j}>{p.text}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

/** VGL: tone and pictogram of a Coach section the model itself titled (presentation only). */
const SECTION_STYLE: Record<CoachSectionKind, { icon: GameIconName; tile: string; rule: string }> =
  {
    observed: {
      icon: "crosshair",
      tile: "border-context/30 bg-context/10 text-context",
      rule: "border-l-context/60",
    },
    interpretation: {
      icon: "dna",
      tile: "border-border-strong bg-elevated text-foreground",
      rule: "border-l-border-strong",
    },
    action: {
      icon: "target",
      tile: "border-primary/30 bg-primary/10 text-primary",
      rule: "border-l-primary/70",
    },
    strength: {
      icon: "trend",
      tile: "border-primary/30 bg-primary/10 text-primary",
      rule: "border-l-primary/50",
    },
    weakness: {
      icon: "alert",
      tile: "border-warning/30 bg-warning/10 text-warning",
      rule: "border-l-warning/60",
    },
  };

/**
 * Safe rendering of the model's light Markdown (headings, bullets, bold, code, pipe
 * tables) after math markup is rewritten as plain text. Text nodes only: no HTML.
 */
export function CoachText({ content }: { content: string }) {
  type Block = ReturnType<typeof coachBlocks>[number];
  // Group the blocks under the heading that precedes them (the Coach's own structure).
  const groups: Array<{ heading: Extract<Block, { kind: "heading" }> | null; items: Block[] }> = [
    { heading: null, items: [] },
  ];
  for (const block of coachBlocks(content)) {
    if (block.kind === "heading") groups.push({ heading: block, items: [] });
    else groups[groups.length - 1]!.items.push(block);
  }
  let key = 0;
  let leadDone = false;
  const renderBlock = (block: Block) => {
    const i = key++;
    if (block.kind === "space") return <div key={i} className="h-1" />;
    if (block.kind === "heading") return null;
    if (block.kind === "bullet")
      return (
        <p key={i} className="flex gap-2.5" data-coach-bullet>
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/80" />
          <span className="min-w-0">
            <Inline text={block.text} />
          </span>
        </p>
      );
    if (block.kind === "table")
      return (
        <div key={i} className="my-1 overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-xs tabular-nums" data-coach-table>
            <thead>
              <tr className="bg-elevated/60">
                {block.header.map((cell, c) => (
                  <th
                    key={c}
                    className="border-b border-border px-2.5 py-1.5 text-left font-mono font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="even:bg-elevated/20">
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-border/50 px-2.5 py-1.5 last:border-b-0">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    // VGL 2.0 continuation: the reply's first paragraph reads as its lead (typography only).
    const lead = !leadDone;
    leadDone = true;
    return (
      <p
        key={i}
        className={lead ? "text-[15px] leading-relaxed text-foreground" : undefined}
        data-coach-lead={lead ? "" : undefined}
      >
        <Inline text={block.text} />
      </p>
    );
  };
  return (
    <div className="space-y-2" data-coach-text>
      {groups.map((g, gi) => {
        if (!g.heading) return <Fragment key={gi}>{g.items.map(renderBlock)}</Fragment>;
        const kind = coachSectionKind(g.heading.text);
        if (!kind)
          return (
            <Fragment key={gi}>
              <p
                className="mt-1 border-l-2 border-primary/60 pl-2.5 pt-0.5 font-display font-semibold tracking-wide text-foreground"
                data-coach-heading
              >
                <Inline text={g.heading.text} />
              </p>
              {g.items.map(renderBlock)}
            </Fragment>
          );
        const style = SECTION_STYLE[kind];
        return (
          <section
            key={gi}
            className={cn(
              "mt-2 space-y-2 rounded-md border border-border border-l-2 bg-elevated/30 px-3 py-2.5",
              style.rule,
            )}
            data-coach-section={kind}
          >
            <p
              className="flex items-center gap-2 font-display font-semibold tracking-wide text-foreground"
              data-coach-heading
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md border",
                  style.tile,
                )}
              >
                <GameIcon name={style.icon} className="size-3.5" />
              </span>
              <Inline text={g.heading.text} />
            </p>
            {g.items.map(renderBlock)}
          </section>
        );
      })}
    </div>
  );
}

/** VGL 2.0: radar sweep while the Coach is actually generating (real activity only). */
function RadarSweep() {
  return (
    <span aria-hidden className="relative inline-flex size-6 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-primary/40" />
      <span className="absolute inset-1.5 rounded-full border border-primary/25" />
      <span className="vgl-sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,color-mix(in_oklab,var(--primary)_55%,transparent)_60deg,transparent_61deg)]" />
      <span className="size-1 rounded-full bg-primary" />
    </span>
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
    <div
      className={cn("flex gap-3", isCoach ? "justify-start" : "justify-end")}
      data-message-role={message.role}
    >
      {isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <GameIcon name="crosshair" className="size-4" />
        </span>
      ) : null}
      <div
        className={cn(
          "min-w-0 text-sm leading-relaxed",
          isCoach
            ? "surface-panel relative max-w-[min(100%,46rem)] flex-1 overflow-hidden rounded-lg border border-border px-4 py-3 pl-5 text-foreground"
            : "max-w-[85%] rounded-2xl rounded-br-md border border-primary/25 bg-primary/10 px-4 py-2.5 text-foreground",
        )}
      >
        {isCoach ? (
          <>
            <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary/60" />
            <p className="mb-2 flex items-center justify-between gap-3 font-mono text-xs uppercase tracking-[0.16em] text-primary">
              <span>{aiLabel}</span>
              <span className="normal-case tracking-normal text-muted-foreground">{time}</span>
            </p>
            <CoachText content={message.content} />
            <CoachMapContext content={message.content} />
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{message.content}</p>
            <p className="mt-1.5 text-right font-mono text-xs text-muted-foreground">{time}</p>
          </>
        )}
      </div>
      {!isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
          <User className="size-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

const ONBOARDING_DISMISSED = "cs2pro.coach.onboardingDismissed";
function readDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(ONBOARDING_DISMISSED) === "1";
  } catch {
    return false;
  }
}
function writeDismissed() {
  try {
    globalThis.localStorage?.setItem(ONBOARDING_DISMISSED, "1");
  } catch {
    /* per-viewer convenience only */
  }
}

export function RealCoachChat({ className }: { className?: string | undefined }) {
  const { t, intlTag, locale } = useI18n();
  const queryClient = useQueryClient();
  const state = useQuery({ queryKey: COACH_STATE_KEY, queryFn: () => getCoachState() });
  const prefs = useQuery({ queryKey: COACH_PREFERENCES_KEY, queryFn: () => getCoachPreferences() });
  const [draft, setDraft] = useState("");
  // UX-1.8: the page behind the drawer (or /coach itself) goes with each question.
  const location = useRouterState({ select: (st) => st.location });
  const screen = coachScreenFrom(location.pathname, location.search as Record<string, unknown>);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<CoachErrorCode | null>(null);
  /** undefined: the latest conversation; null: a new one; string: one picked from the list. */
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [showPrefs, setShowPrefs] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const requestRef = useRef<{
    id: string;
    message: string;
    conversationId: string | null;
  } | null>(null);
  const sending = useRef(false);
  const latestId = state.data?.conversationId ?? null;
  const picked = typeof selected === "string" && selected !== latestId ? selected : null;
  const other = useQuery({
    queryKey: ["coach", "conversation", picked],
    queryFn: () => getCoachConversation({ data: { conversationId: picked } }),
    enabled: picked !== null,
  });

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

  const conversationId: string | null =
    selected === undefined ? data.conversationId : selected === null ? null : selected;
  const loadingOther = picked !== null && other.isPending;
  const otherFailed = picked !== null && (other.isError || other.data?.found === false);
  const messages: CoachMessageView[] =
    conversationId === null
      ? []
      : conversationId === data.conversationId
        ? data.messages
        : (other.data?.messages ?? []);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending.current) return; // anti double-send
    sending.current = true;
    setPending(message);
    setError(null);
    try {
      // Idempotency: the same question retried in the same conversation reuses its request
      // id, so a reply that was generated but not received is returned instead of re-billed.
      const prior = requestRef.current;
      const requestId =
        prior && prior.message === message && prior.conversationId === conversationId
          ? prior.id
          : globalThis.crypto.randomUUID();
      requestRef.current = { id: requestId, message, conversationId };
      const result = await sendCoachMessage({
        data: { message, locale, conversationId, requestId, screen },
      });
      if (result.ok) {
        requestRef.current = null;
        setDraft("");
        // The answered conversation is now the most recent one: it becomes "latest".
        queryClient.setQueryData<CoachState>(COACH_STATE_KEY, (prev) =>
          prev
            ? {
                ...prev,
                conversationId: result.conversationId,
                messages: [...messages, result.player, result.coach],
                remainingThisHour: Math.max(0, prev.remainingThisHour - 1),
              }
            : prev,
        );
        setSelected(undefined);
        void queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_KEY });
      } else {
        // Fase 3.5: when the outcome is uncertain or the id can no longer be used, the next
        // send is a NEW request (a deliberate retry); otherwise the same id is reused so a
        // reply that was generated but not received is replayed instead of billed again.
        if (FRESH_ID_AFTER.has(result.error)) requestRef.current = null;
        setError(result.error); // the draft is kept so the player can retry
      }
    } catch {
      setError("COACH_INTERNAL");
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  // Optional onboarding: only when preferences can be stored and none were saved.
  const prefsAvailable = prefs.data?.available === true;
  const showOnboarding =
    prefsAvailable &&
    !dismissed &&
    !showPrefs &&
    prefs.data?.saved === false &&
    messages.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="vgl-grid relative isolate flex flex-wrap items-center justify-between gap-2 border-b border-border bg-elevated/60 px-4 py-2 sm:py-2.5">
        <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-20 bg-primary" />
        <div className="min-w-0 flex-1 max-sm:contents">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground max-sm:order-1 sm:text-sm">
            <span className="flex size-6 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <GameIcon name="crosshair" className="size-3.5" />
            </span>
            {t("coach2.persona.identity")}
          </p>
          <p className="text-xs leading-snug text-muted-foreground max-sm:order-3 max-sm:w-full">
            {t("real.aicoach.disclaimer")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 max-sm:order-2" data-coach-actions>
          <ConversationMenu
            activeId={conversationId}
            disabled={pending !== null}
            onSelect={(id) => {
              setSelected(id);
              setError(null);
            }}
          />
          {prefsAvailable ? <PersonalizeButton onClick={() => setShowPrefs((v) => !v)} /> : null}
          <DeleteConversationButton
            conversationId={conversationId}
            disabled={pending !== null}
            onDeleted={() => {
              setSelected(undefined);
              setError(null);
              void queryClient.invalidateQueries({ queryKey: COACH_STATE_KEY });
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={pending !== null || messages.length === 0}
            onClick={() => {
              setSelected(null);
              setError(null);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">{t("real.aicoach.newConversation")}</span>
          </Button>
        </div>
      </div>
      {showPrefs && prefsAvailable ? (
        <PreferencesPanel onClose={() => setShowPrefs(false)} />
      ) : null}
      {data.dataState === "INSUFFICIENT_SAMPLE" ? (
        <p className="flex items-start gap-2 border-b border-warning/20 bg-warning/8 px-4 py-2 text-xs text-muted-foreground">
          <GameIcon name="alert" className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {t("real.aicoach.insufficient")}
        </p>
      ) : null}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        <div className="mx-auto w-full max-w-4xl space-y-5" data-coach-thread>
          {loadingOther ? <LoadingState /> : null}
          {otherFailed ? (
            <p role="alert" className="text-sm text-destructive">
              {t("coach2.loadError")}
            </p>
          ) : null}
          {!loadingOther && !otherFailed && messages.length === 0 && pending === null ? (
            <div className="space-y-6">
              <EmptyState
                title={
                  data.playerName
                    ? t("coach2.persona.greetingNamed").replace("{name}", data.playerName)
                    : t("coach2.persona.greeting")
                }
                description={`${t("coach2.persona.intro")} ${t("real.aicoach.emptyDescription")}`}
                icon={<GameIcon name="target" className="size-5" />}
              />
              {showOnboarding ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-xs text-muted-foreground"
                  data-coach-onboarding
                >
                  <span className="min-w-0 flex-1">{t("coach2.onboarding.hint")}</span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setShowPrefs(true)}>
                      {t("coach2.personalize")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        writeDismissed();
                        setDismissed(true);
                      }}
                    >
                      {t("coach2.onboarding.dismiss")}
                    </Button>
                  </span>
                </div>
              ) : null}
              <SuggestedQuestions onPick={(text) => setDraft(text)} />
            </div>
          ) : null}
          {messages.map((m) => (
            <Bubble key={m.id} message={m} aiLabel={t("real.aicoach.aiLabel")} intlTag={intlTag} />
          ))}
          {pending !== null ? (
            <>
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm opacity-70">
                  {pending}
                </p>
              </div>
              <p
                className="flex items-center gap-2.5 font-mono text-xs text-muted-foreground"
                role="status"
                data-coach-thinking
              >
                <RadarSweep />
                {t("coach.thinking")}
              </p>
            </>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm"
            >
              <p className="flex items-center gap-2 font-medium text-destructive">
                <GameIcon name="alert" className="size-4 shrink-0" />
                {t("coach.errorTitle")}
              </p>
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
      </div>
      <form
        className="border-t border-border bg-elevated/30 p-3"
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
        <p className="mt-1.5 flex justify-between font-mono text-xs text-muted-foreground">
          <span>{t("real.aicoach.remaining").replace("{n}", String(data.remainingThisHour))}</span>
          <span>
            {draft.length}/{COACH_MAX_MESSAGE_CHARS}
          </span>
        </p>
      </form>
    </div>
  );
}
