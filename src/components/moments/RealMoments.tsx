/**
 * PM5 module I — the player's moments library: bookmarks (title, note, tags), collections,
 * filters and keyset pagination; every moment opens the 2D replay at its own match, round and
 * tick. Private: nothing here is shared. Deleting a moment or a collection never touches the
 * match or its events.
 */
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Trash2 } from "lucide-react";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { MapTile } from "@/components/common/GameVisuals";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { AppShell } from "@/components/layout/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { fill, formatDate } from "@/lib/format";
import {
  createCollection,
  deleteCollection,
  deleteMoment,
  listMoments,
  setCollectionMembership,
  updateCollection,
  updateMoment,
  type Moment,
  type MomentCollection,
  type MomentsPage,
} from "@/lib/moments.functions";
import { MOMENT_KINDS, replaySearch, type MomentKind } from "@/lib/moments/moments";

export interface MomentsSearch {
  collectionId?: string | undefined;
  kind?: MomentKind | undefined;
  tag?: string | undefined;
  map?: string | undefined;
  q?: string | undefined;
}

export const momentsQueryKey = (s: MomentsSearch) => ["player", "moments", s] as const;

export function RealMomentsPage({
  search,
  onSearch,
}: {
  search: MomentsSearch;
  onSearch: (s: MomentsSearch) => void;
}) {
  const t = useT();
  const query = useInfiniteQuery({
    queryKey: momentsQueryKey(search),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listMoments({ data: { ...search, ...(pageParam ? { cursor: pageParam } : {}) } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("moments.eyebrow")}
          title={t("moments.title")}
          description={t("moments.description")}
        />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError || !query.data ? (
          <ErrorState
            title={t("real.error.title")}
            description={t("real.error.description")}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <MomentsBody
            pages={query.data.pages}
            search={search}
            onSearch={onSearch}
            hasMore={query.hasNextPage}
            loadingMore={query.isFetchingNextPage}
            onMore={() => void query.fetchNextPage()}
          />
        )}
      </div>
    </AppShell>
  );
}

export function MomentsBody({
  pages,
  search,
  onSearch,
  hasMore,
  loadingMore,
  onMore,
}: {
  pages: MomentsPage[];
  search: MomentsSearch;
  onSearch: (s: MomentsSearch) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const t = useT();
  const first = pages[0]!;
  const moments = pages.flatMap((p) => p.moments);
  const filtered = Boolean(
    search.collectionId || search.kind || search.tag || search.map || search.q,
  );
  return (
    <div
      className="grid gap-6 lg:grid-cols-[16rem_1fr]"
      data-moments-status={moments.length ? "OK" : filtered ? "NO_MATCH" : "EMPTY"}
    >
      <Collections
        collections={first.collections}
        active={search.collectionId}
        onSearch={(id) => onSearch({ ...search, collectionId: id })}
      />
      <div className="space-y-4">
        <Filters search={search} tags={first.tags} onSearch={onSearch} />
        {moments.length === 0 ? (
          <EmptyState
            icon={<CircleDashed className="size-5" aria-hidden />}
            title={t(filtered ? "moments.noMatch.title" : "moments.empty.title")}
            description={t(filtered ? "moments.noMatch.description" : "moments.empty.description")}
          />
        ) : (
          <ul className="space-y-3" data-moment-list>
            {moments.map((m) => (
              <MomentItem key={m.id} m={m} collections={first.collections} />
            ))}
          </ul>
        )}
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            onClick={onMore}
            disabled={loadingMore}
            data-moments-more
          >
            {t("moments.more")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("moments.privacy")}</p>
      </div>
    </div>
  );
}

function Filters({
  search,
  tags,
  onSearch,
}: {
  search: MomentsSearch;
  tags: string[];
  onSearch: (s: MomentsSearch) => void;
}) {
  const t = useT();
  const [q, setQ] = useState(search.q ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch({ ...search, q: q.trim() || undefined });
      }}
      data-moments-filters
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>{t("moments.filter.search")}</span>
        <Input
          value={q}
          maxLength={60}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-48"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>{t("moments.filter.kind")}</span>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={search.kind ?? ""}
          onChange={(e) =>
            onSearch({ ...search, kind: (e.target.value || undefined) as MomentKind | undefined })
          }
        >
          <option value="">{t("moments.filter.all")}</option>
          {MOMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`moments.kind.${k}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>{t("moments.filter.tag")}</span>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={search.tag ?? ""}
          onChange={(e) => onSearch({ ...search, tag: e.target.value || undefined })}
        >
          <option value="">{t("moments.filter.all")}</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" className="h-9">
        {t("moments.filter.apply")}
      </Button>
    </form>
  );
}

function Collections({
  collections,
  active,
  onSearch,
}: {
  collections: MomentCollection[];
  active: string | undefined;
  onSearch: (id: string | undefined) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createCollection({ data: { name: name.trim() } }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["player", "moments"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCollection({ data: { id } }),
    onSuccess: () => {
      onSearch(undefined);
      void qc.invalidateQueries({ queryKey: ["player", "moments"] });
    },
  });
  const archive = useMutation({
    mutationFn: (c: MomentCollection) =>
      updateCollection({ data: { id: c.id, archived: !c.archived } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["player", "moments"] }),
  });
  return (
    <ChartCard title={t("moments.collections")} subtitle={t("moments.collections.subtitle")}>
      <ul className="space-y-1 text-sm" data-collections>
        <li>
          <button
            type="button"
            className={
              !active
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }
            aria-current={!active ? "true" : undefined}
            onClick={() => onSearch(undefined)}
          >
            {t("moments.collections.all")}
          </button>
        </li>
        {collections.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2"
            data-collection={c.id}
            data-archived={c.archived}
          >
            <button
              type="button"
              className={
                active === c.id
                  ? "flex-1 truncate text-left font-semibold text-foreground"
                  : "flex-1 truncate text-left text-muted-foreground hover:text-foreground"
              }
              aria-current={active === c.id ? "true" : undefined}
              onClick={() => onSearch(c.id)}
            >
              {c.name} <span className="font-mono text-xs">({c.count})</span>
              {c.archived ? (
                <span className="ml-1 text-xs">· {t("moments.collections.archived")}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => archive.mutate(c)}
            >
              {t(c.archived ? "moments.collections.unarchive" : "moments.collections.archive")}
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  aria-label={fill(t("moments.collections.delete"), { name: c.name })}
                >
                  <Trash2 className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {fill(t("moments.collections.delete"), { name: c.name })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("moments.collections.deleteBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("moments.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate(c.id)}>
                    {t("moments.confirmDelete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("moments.collections.new")}
          aria-label={t("moments.collections.new")}
          className="h-8"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!name.trim() || create.isPending}
        >
          {t("moments.collections.create")}
        </Button>
      </form>
    </ChartCard>
  );
}

/** VGL: pictogram of each moment kind (decorative; the kind is also written in the meta line). */
const MOMENT_ICON: Record<MomentKind, GameIconName> = {
  KILL: "kill",
  DEATH: "skull",
  OPENING: "opening",
  TRADE: "trade",
  CLUTCH: "clutch",
  MULTIKILL: "kill",
  UTILITY: "grenade",
  PLANT: "bomb",
  DEFUSE: "defuse",
  ROUND: "rounds",
  TICK_RANGE: "clock",
};

function MomentItem({ m, collections }: { m: Moment; collections: MomentCollection[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [note, setNote] = useState(m.note);
  const [tags, setTags] = useState(m.tags.join(", "));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["player", "moments"] });
  const save = useMutation({
    mutationFn: () =>
      updateMoment({
        data: {
          id: m.id,
          title: title.trim(),
          note,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (r) => {
      if (r.status === "OK") {
        setEditing(false);
        refresh();
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMoment({ data: { id: m.id } }),
    onSuccess: refresh,
  });
  const member = useMutation({
    mutationFn: (v: { collectionId: string; member: boolean }) =>
      setCollectionMembership({ data: { ...v, bookmarkId: m.id } }),
    onSuccess: refresh,
  });
  return (
    <li
      className={cn(
        "vgl-lift surface-panel rounded-lg border border-border border-l-4 p-3",
        m.kind === "UTILITY"
          ? "border-l-category-utility"
          : m.kind === "DEATH"
            ? "border-l-destructive"
            : m.kind === "KILL"
              ? "border-l-primary"
              : "border-l-border-strong",
      )}
      data-moment={m.id}
      data-moment-kind={m.kind}
      data-availability={m.availability}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border",
            m.kind === "UTILITY"
              ? "border-category-utility/30 bg-category-utility/10 text-category-utility"
              : "border-primary/25 bg-primary/10 text-primary",
          )}
          data-moment-icon={MOMENT_ICON[m.kind]}
        >
          <GameIcon name={MOMENT_ICON[m.kind]} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{m.title}</div>
          <div className="text-xs text-muted-foreground">
            {t(`moments.kind.${m.kind}` as TranslationKey)} ·{" "}
            {m.map ? mapDisplayName(m.map) : t("moments.mapUnknown")}
            {m.roundNumber !== null
              ? ` · ${fill(t("moments.round"), { n: m.roundNumber })}`
              : ""} · {formatDate(m.createdAt, intlTag)}
          </div>
        </div>
        {m.map ? <MapTile map={m.map} size="sm" className="self-center" /> : null}
        {m.availability === "AVAILABLE" && m.matchId ? (
          <Link
            to="/replay"
            search={replaySearch({
              matchId: m.matchId,
              roundNumber: m.roundNumber,
              tickStart: m.tickStart,
            })}
            className="text-sm text-primary underline-offset-2 hover:underline"
            data-moment-replay
          >
            {t("moments.openReplay")}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground" data-moment-unavailable>
            {t("moments.unavailable")}
          </span>
        )}
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) save.mutate();
          }}
        >
          <Input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t("moments.field.title")}
          />
          <Textarea
            value={note}
            maxLength={2000}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t("moments.field.note")}
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label={t("moments.field.tags")}
            placeholder={t("moments.field.tagsHint")}
          />
          {save.data && save.data.status !== "OK" ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`moments.error.${save.data.status}` as TranslationKey)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {t("moments.saveChanges")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("moments.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {m.note ? <p className="mt-2 whitespace-pre-wrap text-sm">{m.note}</p> : null}
          {m.tags.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("moments.field.tags")}>
              {m.tags.map((tag) => (
                <li key={tag} className="rounded border border-border px-1.5 py-0.5 text-xs">
                  #{tag}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => setEditing(true)}
            >
              {t("moments.edit")}
            </button>
            {collections.length ? (
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">{t("moments.addTo")}</span>
                <select
                  className="h-7 rounded border border-border bg-background px-1"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id)
                      member.mutate({ collectionId: id, member: !m.collections.includes(id) });
                  }}
                >
                  <option value="">—</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {m.collections.includes(c.id) ? `✓ ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="text-destructive underline-offset-2 hover:underline"
                  data-moment-delete
                >
                  {t("moments.delete")}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("moments.delete.title")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("moments.delete.body")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("moments.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>
                    {t("moments.confirmDelete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </li>
  );
}
