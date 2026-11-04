/**
 * AI Coach controls (Fase 3.2): conversation list, two-step delete, optional preferences
 * (main difficulty, maps of interest) and suggested questions. Every action calls a real
 * server function; nothing here is decorative.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { History, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import {
  COACH_DIFFICULTY_CODES,
  COACH_MAP_CODES,
  deleteCoachConversation,
  deleteCoachPreferences,
  getCoachPreferences,
  listCoachConversations,
  saveCoachPreferences,
  type CoachPreferences,
} from "@/lib/coachSession.functions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const COACH_CONVERSATIONS_KEY = ["coach", "conversations"] as const;
export const COACH_PREFERENCES_KEY = ["coach", "preferences"] as const;

const MAP_LABEL = (code: string) => {
  const bare = code.replace(/^de_/, "");
  return bare === "dust2" ? "Dust II" : bare.charAt(0).toUpperCase() + bare.slice(1);
};

export function ConversationMenu({
  activeId,
  onSelect,
  disabled,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const { intlTag } = useI18n();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: COACH_CONVERSATIONS_KEY,
    queryFn: () => listCoachConversations(),
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} data-coach-conversations>
          <History className="size-3.5" aria-hidden />
          {t("coach2.conversations")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {list.isPending ? (
          <p className="p-3 text-xs text-muted-foreground">…</p>
        ) : list.isError ? (
          <p className="p-3 text-xs text-destructive">{t("coach2.loadError")}</p>
        ) : !list.data?.length ? (
          <p className="p-3 text-xs text-muted-foreground">{t("coach2.conversationsEmpty")}</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto" aria-label={t("coach2.conversations")}>
            {list.data.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === activeId ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    c.id === activeId && "bg-secondary",
                  )}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="block truncate">{c.title || t("coach2.untitled")}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    <time dateTime={c.updatedAt}>{formatDateTime(c.updatedAt, intlTag)}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function DeleteConversationButton({
  conversationId,
  onDeleted,
  disabled,
}: {
  conversationId: string | null;
  onDeleted: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!conversationId) return null;
  if (!confirming)
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={t("coach2.delete")}
        title={t("coach2.delete")}
        onClick={() => {
          setConfirming(true);
          setFailed(false);
        }}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    );
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await deleteCoachConversation({ data: { conversationId } });
            if (!r.deleted) throw new Error("not deleted");
            await queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_KEY });
            setConfirming(false);
            onDeleted();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("coach2.deleteConfirm")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        {t("coach2.deleteCancel")}
      </Button>
      {failed ? (
        <span role="alert" className="text-[11px] text-destructive">
          {t("coach2.deleteError")}
        </span>
      ) : null}
    </span>
  );
}

export function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const prefs = useQuery({
    queryKey: COACH_PREFERENCES_KEY,
    queryFn: () => getCoachPreferences(),
  });
  if (prefs.isPending) return <p className="p-4 text-xs text-muted-foreground">…</p>;
  if (prefs.isError || !prefs.data)
    return <p className="p-4 text-xs text-destructive">{t("coach2.prefs.error")}</p>;
  return (
    <PreferencesForm
      initial={prefs.data}
      onClose={onClose}
      onSaved={(p) => queryClient.setQueryData(COACH_PREFERENCES_KEY, p)}
    />
  );
}

export function PreferencesForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: CoachPreferences;
  onClose: () => void;
  onSaved: (p: CoachPreferences) => void;
}) {
  const t = useT();
  const [difficulty, setDifficulty] = useState<string>(initial.mainDifficulty ?? "");
  const [maps, setMaps] = useState<string[]>(initial.maps);
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "removed" | "error">("idle");
  const toggle = (code: string) =>
    setMaps((m) => (m.includes(code) ? m.filter((x) => x !== code) : [...m, code]));
  return (
    <section
      className="space-y-4 border-b border-border bg-card/60 p-4"
      aria-label={t("coach2.prefs.title")}
      data-coach-preferences
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("coach2.prefs.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("coach2.prefs.description")}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("coach2.prefs.close")} onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <label className="block text-xs font-medium text-foreground">
        {t("coach2.prefs.difficulty")}
        <select
          className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">{t("coach2.prefs.difficultyNone")}</option>
          {COACH_DIFFICULTY_CODES.map((code) => (
            <option key={code} value={code}>
              {t(`coach2.prefs.diff.${code}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-xs font-medium text-foreground">{t("coach2.prefs.maps")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {COACH_MAP_CODES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={maps.includes(code)}
              onClick={() => toggle(code)}
              className={cn(
                "rounded-sm border px-2 py-1 text-xs",
                maps.includes(code)
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {MAP_LABEL(code)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {t("coach2.prefs.profileNote")}{" "}
        <Link to="/profile" className="underline underline-offset-2">
          {t("coach2.prefs.openProfile")}
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={status === "busy"}
          onClick={async () => {
            setStatus("busy");
            try {
              const r = await saveCoachPreferences({
                data: { mainDifficulty: difficulty || null, maps },
              });
              if (!r.ok) throw new Error("invalid");
              onSaved(r.preferences);
              setStatus("saved");
            } catch {
              setStatus("error");
            }
          }}
        >
          {t("coach2.prefs.save")}
        </Button>
        {initial.saved || status === "saved" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={status === "busy"}
            onClick={async () => {
              setStatus("busy");
              try {
                await deleteCoachPreferences();
                setDifficulty("");
                setMaps([]);
                onSaved({ available: true, saved: false, mainDifficulty: null, maps: [] });
                setStatus("removed");
              } catch {
                setStatus("error");
              }
            }}
          >
            {t("coach2.prefs.remove")}
          </Button>
        ) : null}
        <span role="status" className="text-xs text-muted-foreground">
          {status === "saved"
            ? t("coach2.prefs.saved")
            : status === "removed"
              ? t("coach2.prefs.removed")
              : status === "error"
                ? t("coach2.prefs.error")
                : ""}
        </span>
      </div>
    </section>
  );
}

export function PersonalizeButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <Button variant="ghost" size="sm" onClick={onClick} data-coach-personalize>
      <SlidersHorizontal className="size-3.5" aria-hidden />
      {t("coach2.personalize")}
    </Button>
  );
}

/** Starter questions: clicking fills the box (the player still decides to send). */
export function SuggestedQuestions({ onPick }: { onPick: (text: string) => void }) {
  const t = useT();
  const keys = [1, 2, 3, 4].map((n) => `coach2.suggestion.${n}` as TranslationKey);
  return (
    <div className="space-y-2" data-coach-suggestions>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {t("coach2.suggestions")}
      </p>
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-left text-xs text-foreground hover:border-primary/40 hover:bg-primary/5"
            onClick={() => onPick(t(k))}
          >
            {t(k)}
          </button>
        ))}
      </div>
    </div>
  );
}
