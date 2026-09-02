import { Bot, Send, Sparkles, User } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { getCoachHistory } from "@/services/playerService";
import type { CoachMessage } from "@/types";

function Bubble({ message, exampleLabel }: { message: CoachMessage; exampleLabel: string }) {
  const isCoach = message.role === "coach";
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
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
            {exampleLabel}
          </p>
        ) : null}
        <p>{message.content}</p>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">{message.time}</p>
      </div>
      {!isCoach ? (
        <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
          <User className="size-4" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Shared chat surface used by the /coach page and the desktop drawer.
 * No AI is connected: replies are fixed demonstration strings.
 */
export function CoachChat({ className }: { className?: string | undefined }) {
  const { t, intlTag } = useI18n();
  const [messages, setMessages] = useState<CoachMessage[]>(getCoachHistory());
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const time = new Date().toLocaleTimeString(intlTag, { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { id: `p-${prev.length}`, role: "player", content, time }]);
    setDraft("");
    // Local-only "typing" state: no network request is made in this stage.
    setThinking(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `c-${prev.length}`, role: "coach", content: t("coach.placeholderReply"), time },
      ]);
      setThinking(false);
    }, 700);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <EmptyState
            title={t("coach.emptyTitle")}
            description={t("coach.emptyDescription")}
            icon={<Sparkles className="size-5" aria-hidden />}
          />
        ) : (
          messages.map((m) => (
            <Bubble key={m.id} message={m} exampleLabel={t("coach.exampleMessage")} />
          ))
        )}
        {thinking ? (
          <p
            role="status"
            aria-live="polite"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            {t("coach.thinking")}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={t("coach.placeholder")}
            className="min-h-[52px] resize-none"
          />
          <Button onClick={send} className="h-[52px] gap-2 px-4" aria-label={t("coach.sendAria")}>
            <Send className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("coach.send")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
