/**
 * Fase 4 — notification bell, center and preferences. Every action calls a real server
 * function; the list is keyset-paginated and deduplicated by id; nothing is simulated.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Mail, MailOpen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { fill, formatDateTime } from "@/lib/format";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "@/lib/notifications/notificationEvents";
import {
  deleteNotification,
  getNotificationPreferences,
  listNotifications,
  markNotifications,
  saveNotificationPreferences,
  syncNotifications,
  type NotificationPage,
  type NotificationPrefs,
  type NotificationView,
} from "@/lib/notifications/notifications.functions";
import { cn } from "@/lib/utils";

export const NOTIFICATIONS_KEY = ["notifications"] as const;
const PREFS_KEY = ["notifications", "prefs"] as const;
/** Sync cadence while the app is open (the database ignores duplicates). */
const SYNC_MS = 120_000;

type T = (key: TranslationKey) => string;

export function notificationText(n: NotificationView, t: T): { title: string; body: string } {
  const p = n.params;
  const metric =
    typeof p["metric"] === "string" ? t(`notify.metric.${p["metric"]}` as TranslationKey) : "";
  const vars = { ...p, metric } as Record<string, string | number>;
  switch (n.type) {
    case "analysis_ready":
      return {
        title: t("notify.type.analysis_ready.title"),
        body: p["map"]
          ? fill(t("notify.type.analysis_ready.bodyMap"), vars)
          : t("notify.type.analysis_ready.body"),
      };
    case "demo_failed":
      return { title: t("notify.type.demo_failed.title"), body: t("notify.type.demo_failed.body") };
    case "evolution":
      return {
        title: fill(
          t(
            p["direction"] === "DOWN"
              ? "notify.type.evolution.titleDown"
              : "notify.type.evolution.titleUp",
          ),
          vars,
        ),
        body: fill(t("notify.type.evolution.body"), vars),
      };
    case "goal_reached":
      return {
        title: t("notify.type.goal_reached.title"),
        body: fill(t("notify.type.goal_reached.body"), vars),
      };
    case "steam_linked":
      return {
        title: t("notify.type.steam_linked.title"),
        body: t("notify.type.steam_linked.body"),
      };
    case "steam_unlinked":
      return {
        title: t("notify.type.steam_unlinked.title"),
        body: t("notify.type.steam_unlinked.body"),
      };
    case "goal_reminder":
      return {
        title: t("notify.type.goal_reminder.title"),
        body: fill(t("notify.type.goal_reminder.body"), vars),
      };
    default:
      return { title: t(`notify.cat.${n.category}` as TranslationKey), body: "" };
  }
}

/**
 * "1 não lida" / "2 não lidas": the locale's own plural rules (Intl.PluralRules), with the
 * one/other forms in the dictionaries. Nothing hardcoded in the component.
 */
export function unreadLabel(count: number, locale: string, t: T): string {
  const form = new Intl.PluralRules(locale).select(count) === "one" ? "one" : "other";
  return fill(t(`notify.bell.unread.${form}` as TranslationKey), { count });
}

/** Keeps the caller's notifications in sync while the app is open. */
function useNotificationSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const r = await syncNotifications();
        if (alive && r.accepted > 0)
          await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      } catch {
        /* sync is best-effort; the center shows its own error state */
      }
    };
    void run();
    const id = setInterval(run, SYNC_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [queryClient]);
}

function useMark() {
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);
  const run = async (input: { ids?: string[]; all?: boolean; read: boolean }) => {
    setFailed(false);
    try {
      const r = await markNotifications({ data: input });
      if (!r.ok) throw new Error("invalid");
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    } catch {
      setFailed(true);
    }
  };
  return { run, failed };
}

export function NotificationBell() {
  const t = useT();
  const { intlTag } = useI18n();
  const [open, setOpen] = useState(false);
  useNotificationSync();
  const list = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "bell"],
    queryFn: () => listNotifications({ data: {} }),
    refetchInterval: 60_000,
  });
  const mark = useMark();
  const unread = list.data?.unread ?? 0;
  const { locale } = useI18n();
  if (list.data && !list.data.available) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={
            unread
              ? `${t("notify.bell.label")} — ${unreadLabel(unread, locale, t)}`
              : t("notify.bell.label")
          }
          data-notification-bell
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">{t("notify.title")}</p>
          {unread > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => mark.run({ all: true, read: true })}>
              <Check className="size-3.5" aria-hidden />
              {t("notify.markAllRead")}
            </Button>
          ) : null}
        </div>
        {list.isPending ? (
          <p className="p-4 text-xs text-muted-foreground">{t("notify.loading")}</p>
        ) : list.isError ? (
          <div className="space-y-2 p-4">
            <p className="text-xs text-destructive" role="alert">
              {t("notify.error")}
            </p>
            <Button size="sm" variant="outline" onClick={() => list.refetch()}>
              {t("notify.retry")}
            </Button>
          </div>
        ) : !list.data.items.length ? (
          <p className="p-4 text-xs text-muted-foreground">{t("notify.empty")}</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {list.data.items.slice(0, 8).map((n) => {
              const text = notificationText(n, t);
              return (
                <li
                  key={n.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    !n.readAt && "bg-primary/5",
                  )}
                >
                  <Link
                    to={n.link}
                    className="block px-3 py-2 text-left hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      if (!n.readAt) void mark.run({ ids: [n.id], read: true });
                      setOpen(false);
                    }}
                  >
                    <span className="block text-sm font-medium">{text.title}</span>
                    <span className="block text-xs text-muted-foreground">{text.body}</span>
                    <time
                      className="block font-mono text-[10px] text-muted-foreground"
                      dateTime={n.createdAt}
                    >
                      {formatDateTime(n.createdAt, intlTag)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {mark.failed ? (
          <p role="alert" className="px-3 py-1 text-[11px] text-destructive">
            {t("notify.actionError")}
          </p>
        ) : null}
        <div className="border-t border-border p-2 text-center">
          <Link
            to="/notifications"
            className="text-xs underline underline-offset-2"
            onClick={() => setOpen(false)}
          >
            {t("notify.viewAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NotificationCenter() {
  const t = useT();
  const { intlTag } = useI18n();
  const [category, setCategory] = useState<NotificationCategory | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();
  const mark = useMark();
  const [deleteFailed, setDeleteFailed] = useState(false);
  const pages = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, "center", category, unreadOnly],
    queryFn: ({ pageParam }) =>
      listNotifications({ data: { category, unreadOnly, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: NotificationPage) => last.nextCursor,
  });
  // A refetch or a new page can never show the same notification twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (pages.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((n) => !seen.has(n.id) && seen.add(n.id));
  }, [pages.data]);
  const first = pages.data?.pages[0];
  if (first && !first.available)
    return <p className="text-sm text-muted-foreground">{t("notify.unavailable")}</p>;
  return (
    <section className="space-y-4" aria-label={t("notify.title")} data-notification-center>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("notify.filter.label")}
      >
        {[null, ...NOTIFICATION_CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-sm border px-2 py-1 text-xs",
              category === c
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {c ? t(`notify.cat.${c}` as TranslationKey) : t("notify.filter.all")}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          {t("notify.filter.unread")}
        </label>
        {first && first.unread > 0 ? (
          <Button size="sm" variant="outline" onClick={() => mark.run({ all: true, read: true })}>
            <Check className="size-3.5" aria-hidden />
            {t("notify.markAllRead")}
          </Button>
        ) : null}
      </div>
      {mark.failed || deleteFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {t("notify.actionError")}
        </p>
      ) : null}
      {pages.isPending ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("notify.loading")}
        </p>
      ) : pages.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {t("notify.error")}
          </p>
          <Button size="sm" variant="outline" onClick={() => pages.refetch()}>
            {t("notify.retry")}
          </Button>
        </div>
      ) : !items.length ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{t("notify.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("notify.emptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((n) => {
            const text = notificationText(n, t);
            return (
              <li
                key={n.id}
                className={cn(
                  "flex flex-col gap-2 p-3 sm:flex-row sm:items-start",
                  !n.readAt && "bg-primary/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t(`notify.cat.${n.category}` as TranslationKey)} ·{" "}
                    <time dateTime={n.createdAt}>{formatDateTime(n.createdAt, intlTag)}</time>
                  </p>
                  <p className="text-sm font-medium">{text.title}</p>
                  <p className="text-sm text-muted-foreground">{text.body}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to={n.link}
                      onClick={() =>
                        !n.readAt ? void mark.run({ ids: [n.id], read: true }) : undefined
                      }
                    >
                      {t("notify.open")}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={n.readAt ? t("notify.markUnread") : t("notify.markRead")}
                    title={n.readAt ? t("notify.markUnread") : t("notify.markRead")}
                    onClick={() => mark.run({ ids: [n.id], read: !n.readAt })}
                  >
                    {n.readAt ? (
                      <Mail className="size-3.5" aria-hidden />
                    ) : (
                      <MailOpen className="size-3.5" aria-hidden />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("notify.delete")}
                    title={t("notify.delete")}
                    onClick={async () => {
                      setDeleteFailed(false);
                      try {
                        await deleteNotification({ data: { id: n.id } });
                        await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
                      } catch {
                        setDeleteFailed(true);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pages.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pages.isFetchingNextPage}
          onClick={() => pages.fetchNextPage()}
        >
          {pages.isFetchingNextPage ? t("notify.loading") : t("notify.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}

export function NotificationPreferences() {
  const t = useT();
  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: () => getNotificationPreferences() });
  if (prefs.isPending)
    return <p className="text-sm text-muted-foreground">{t("notify.loading")}</p>;
  if (prefs.isError)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          {t("notify.error")}
        </p>
        <Button size="sm" variant="outline" onClick={() => prefs.refetch()}>
          {t("notify.retry")}
        </Button>
      </div>
    );
  if (!prefs.data.available) return null;
  return <PreferencesForm initial={prefs.data} />;
}

export function PreferencesForm({ initial }: { initial: NotificationPrefs }) {
  const t = useT();
  const { intlTag } = useI18n();
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState(initial.categories);
  const [pause, setPause] = useState<0 | 24 | 168>(0);
  const [maxPerDay, setMaxPerDay] = useState(initial.maxPerDay);
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const paused =
    initial.pausedUntil && Date.parse(initial.pausedUntil) > Date.now()
      ? initial.pausedUntil
      : null;
  return (
    <section
      className="space-y-4 rounded-md border border-border p-4"
      aria-label={t("notify.prefs.title")}
      data-notification-preferences
    >
      <div>
        <h2 className="text-sm font-semibold">{t("notify.prefs.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("notify.prefs.description")}</p>
      </div>
      <fieldset className="space-y-2">
        {(Object.keys(categories) as Array<keyof typeof categories>).map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={categories[c]}
              onChange={(e) => setCategories((s) => ({ ...s, [c]: e.target.checked }))}
            />
            {t(`notify.cat.${c}` as TranslationKey)}
          </label>
        ))}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked disabled aria-describedby="security-locked" />
          <span id="security-locked">{t("notify.prefs.securityLocked")}</span>
        </p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          {t("notify.prefs.pause")}
          <select
            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={pause}
            onChange={(e) => setPause(Number(e.target.value) as 0 | 24 | 168)}
          >
            <option value={0}>{t("notify.prefs.pause.none")}</option>
            <option value={24}>{t("notify.prefs.pause.24")}</option>
            <option value={168}>{t("notify.prefs.pause.168")}</option>
          </select>
          {paused ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {fill(t("notify.prefs.pausedUntil"), { date: formatDateTime(paused, intlTag) })}
            </span>
          ) : null}
        </label>
        <label className="block text-xs font-medium">
          {t("notify.prefs.maxPerDay")}
          <input
            type="number"
            min={1}
            max={30}
            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">{t("notify.prefs.email")}:</strong>{" "}
        {t("notify.prefs.emailOff")}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={status === "busy"}
          onClick={async () => {
            setStatus("busy");
            try {
              const r = await saveNotificationPreferences({
                data: { categories, pauseHours: pause || 0, maxPerDay },
              });
              if (!r.ok) throw new Error("invalid");
              await queryClient.invalidateQueries({ queryKey: PREFS_KEY });
              setStatus("saved");
            } catch {
              setStatus("error");
            }
          }}
        >
          {t("notify.prefs.save")}
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {status === "saved"
            ? t("notify.prefs.saved")
            : status === "error"
              ? t("notify.prefs.error")
              : ""}
        </span>
      </div>
    </section>
  );
}
