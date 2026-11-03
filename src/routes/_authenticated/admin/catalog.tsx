import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { CATALOG_LOCALES, CATALOG_TRACKS } from "@/lib/catalog/catalogCore";
import {
  deleteCatalogLesson,
  importCatalog,
  listCatalogGroups,
  listCatalogLessons,
  updateCatalogGroup,
  updateCatalogLesson,
  type CatalogImportReport,
  type CatalogLessonAdminRow,
} from "@/lib/catalogAdmin.functions";

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  head: () => ({
    meta: [
      { title: "Catálogo de cursos — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Manutenção do catálogo de cursos e aulas usado pelo treinamento e pelo AI Coach.",
      },
    ],
  }),
  component: AdminCatalogPage,
});

type Tab = "lessons" | "groups" | "import";
const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none";

function AdminCatalogPage() {
  const t = useT();
  const { adminSession } = Route.useRouteContext();
  const [tab, setTab] = useState<Tab>("lessons");
  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow={t("admin.area")}
        title={t("catalog.admin.title")}
        description={t("catalog.admin.subtitle")}
      />
      <div className="flex flex-wrap gap-2">
        {(["lessons", "groups", "import"] as Tab[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k)}
          >
            {t(`catalog.admin.tab.${k}` as TranslationKey)}
          </Button>
        ))}
      </div>
      {tab === "lessons" ? <LessonsTab /> : tab === "groups" ? <GroupsTab /> : <ImportTab />}
    </AdminShell>
  );
}

function LessonsTab() {
  const t = useT();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: "", locale: "", status: "", active: "", page: 1 });
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lessons = useQuery({
    queryKey: ["admin", "catalog", "lessons", filters],
    queryFn: () => listCatalogLessons({ data: filters }),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCatalogLesson({ data: { id } }),
    onSuccess: () => {
      setNotice(t("catalog.admin.saved"));
      refresh();
    },
    onError: () => setNotice(t("catalog.admin.error")),
  });
  const toggle = useMutation({
    mutationFn: (row: CatalogLessonAdminRow) =>
      updateCatalogLesson({ data: { id: row.id, active: !row.active } }),
    onSuccess: refresh,
    onError: () => setNotice(t("catalog.admin.error")),
  });
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const pages = Math.max(1, Math.ceil((lessons.data?.total ?? 0) / (lessons.data?.pageSize ?? 50)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder={t("catalog.admin.search")}
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select
          className={selectClass}
          value={filters.locale}
          onChange={(e) => set({ locale: e.target.value })}
        >
          <option value="">{`${t("catalog.admin.col.locale")}: ${t("catalog.admin.all")}`}</option>
          {CATALOG_LOCALES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.status}
          onChange={(e) => set({ status: e.target.value })}
        >
          <option value="">{`${t("catalog.admin.col.status")}: ${t("catalog.admin.all")}`}</option>
          <option value="confirmed">{t("catalog.admin.status.confirmed")}</option>
          <option value="pending">{t("catalog.admin.status.pending")}</option>
        </select>
        <select
          className={selectClass}
          value={filters.active}
          onChange={(e) => set({ active: e.target.value })}
        >
          <option value="">{`${t("catalog.admin.active")}: ${t("catalog.admin.all")}`}</option>
          <option value="active">{t("catalog.admin.active")}</option>
          <option value="inactive">{t("catalog.admin.inactive")}</option>
        </select>
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {lessons.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : lessons.isError ? (
        <ErrorState
          title={t("common.errorTitle")}
          description={t("admin.error.generic")}
          onRetry={() => void lessons.refetch()}
        />
      ) : !lessons.data?.rows.length ? (
        <EmptyState title={t("common.emptyTitle")} description={t("catalog.admin.empty")} />
      ) : (
        <ul className="space-y-2">
          {lessons.data.rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              {editing === row.id ? (
                <LessonEditor
                  row={row}
                  onDone={(ok) => {
                    setEditing(null);
                    setNotice(t(ok ? "catalog.admin.saved" : "catalog.admin.error"));
                    refresh();
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{row.title}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      {row.url}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {[
                        row.locale ?? "—",
                        t(`catalog.admin.status.${row.language_status}` as TranslationKey),
                        row.language_evidence,
                        row.group ? t(`catalog.track.${row.group.track}` as TranslationKey) : "—",
                        row.active ? t("catalog.admin.active") : t("catalog.admin.inactive"),
                        row.topics.join(", "),
                      ].join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(row.id)}>
                      {t("catalog.admin.edit")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle.mutate(row)}>
                      {row.active ? t("catalog.admin.deactivate") : t("catalog.admin.activate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (window.confirm(t("catalog.admin.confirmDelete"))) remove.mutate(row.id);
                      }}
                    >
                      {t("catalog.admin.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {`${t("admin.pagination.page")} ${filters.page} ${t("admin.pagination.of")} ${pages} · ${lessons.data?.total ?? 0}`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={filters.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
          >
            {t("admin.pagination.prev")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={filters.page >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            {t("admin.pagination.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LessonEditor({
  row,
  onDone,
}: {
  row: CatalogLessonAdminRow;
  onDone: (ok: boolean) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(row.title);
  const [url, setUrl] = useState(row.url);
  const [locale, setLocale] = useState(row.locale ?? "");
  const [status, setStatus] = useState(row.language_status);
  const [topics, setTopics] = useState(row.topics.join(", "));
  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = { id: row.id };
      if (title !== row.title) patch["title"] = title;
      if (url !== row.url) patch["url"] = url;
      if (locale !== (row.locale ?? "") || status !== row.language_status) {
        patch["locale"] = locale || null;
        patch["language_status"] = status;
      }
      const list = topics
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (list.join() !== row.topics.join()) patch["topics"] = list;
      return updateCatalogLesson({ data: patch });
    },
    onSuccess: () => onDone(true),
    onError: () => onDone(false),
  });
  return (
    <div className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={t("catalog.admin.col.title")}
      />
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        aria-label={t("catalog.admin.field.url")}
      />
      <div className="flex flex-wrap gap-2">
        <select className={selectClass} value={locale} onChange={(e) => setLocale(e.target.value)}>
          <option value="">—</option>
          {CATALOG_LOCALES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value as "confirmed" | "pending")}
        >
          <option value="confirmed">{t("catalog.admin.status.confirmed")}</option>
          <option value="pending">{t("catalog.admin.status.pending")}</option>
        </select>
      </div>
      <Input
        value={topics}
        onChange={(e) => setTopics(e.target.value)}
        placeholder={t("catalog.admin.field.topicsHint")}
        aria-label={t("catalog.admin.col.topics")}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("catalog.admin.save")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDone(true)}>
          {t("catalog.admin.cancel")}
        </Button>
      </div>
    </div>
  );
}

function GroupsTab() {
  const t = useT();
  const qc = useQueryClient();
  const groups = useQuery({
    queryKey: ["admin", "catalog", "groups"],
    queryFn: () => listCatalogGroups(),
  });
  const update = useMutation({
    mutationFn: (data: { id: string; track?: string; active?: boolean }) =>
      updateCatalogGroup({ data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "catalog"] }),
  });
  if (groups.isLoading) return <LoadingState label={t("common.loading")} />;
  if (groups.isError)
    return (
      <ErrorState
        title={t("common.errorTitle")}
        description={t("admin.error.generic")}
        onRetry={() => void groups.refetch()}
      />
    );
  return (
    <ul className="space-y-2">
      {(groups.data ?? []).map((g) => (
        <li
          key={g.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
        >
          <div className="space-y-1">
            <p className="font-mono text-foreground">{g.key}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {`${t("catalog.admin.col.courses")}: ${g.courses} · ${t("catalog.admin.col.lessons")}: ${g.lessons} · ${t("catalog.admin.col.source")}: ${g.track_source} · ${g.topics.join(", ")}`}
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className={selectClass}
              value={g.track}
              onChange={(e) => update.mutate({ id: g.id, track: e.target.value })}
            >
              {CATALOG_TRACKS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`catalog.track.${tr}` as TranslationKey)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate({ id: g.id, active: !g.active })}
            >
              {g.active ? t("catalog.admin.deactivate") : t("catalog.admin.activate")}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ImportTab() {
  const t = useT();
  const qc = useQueryClient();
  const [json, setJson] = useState<{ name: string; text: string } | null>(null);
  const [coursesCsv, setCoursesCsv] = useState("");
  const [lessonsCsv, setLessonsCsv] = useState("");
  const [report, setReport] = useState<CatalogImportReport | null>(null);
  const [error, setError] = useState(false);
  const run = useMutation({
    mutationFn: (dryRun: boolean) =>
      importCatalog({
        data: json
          ? { format: "json", json: json.text, dryRun, source: json.name }
          : { format: "csv", coursesCsv, lessonsCsv, dryRun, source: "csv-upload" },
      }),
    onSuccess: (r) => {
      setError(false);
      setReport(r);
      if (!r.dryRun) void qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
    },
    onError: () => setError(true),
  });
  const read = (file: File | undefined, set: (text: string) => void) => {
    if (file) void file.text().then(set);
  };
  const ready = !!json || !!coursesCsv || !!lessonsCsv;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">{t("catalog.admin.import.help")}</p>
      <label className="block space-y-1">
        <span>{t("catalog.admin.import.json")}</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) =>
            read(e.target.files?.[0], (text) =>
              setJson({ name: e.target.files?.[0]?.name ?? "catalog.json", text }),
            )
          }
        />
      </label>
      <label className="block space-y-1">
        <span>{t("catalog.admin.import.coursesCsv")}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => read(e.target.files?.[0], setCoursesCsv)}
        />
      </label>
      <label className="block space-y-1">
        <span>{t("catalog.admin.import.lessonsCsv")}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => read(e.target.files?.[0], setLessonsCsv)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!ready || run.isPending}
          onClick={() => run.mutate(true)}
        >
          {t("catalog.admin.import.simulate")}
        </Button>
        <Button
          size="sm"
          disabled={!ready || run.isPending || !report?.dryRun}
          onClick={() => run.mutate(false)}
        >
          {t("catalog.admin.import.apply")}
        </Button>
      </div>
      {error ? <p className="text-destructive">{t("catalog.admin.import.failed")}</p> : null}
      {report ? (
        <div className="space-y-1 rounded-lg border border-border bg-card p-3 font-mono text-xs">
          <p className="font-semibold">
            {`${t("catalog.admin.import.report")} — ${report.dryRun ? t("catalog.admin.import.simulated") : t("catalog.admin.import.applied")}`}
          </p>
          <p>{`${t("catalog.admin.col.courses")}: ${report.courses.inserted} ${t("catalog.admin.import.inserted")}, ${report.courses.updated} ${t("catalog.admin.import.updated")}`}</p>
          <p>{`${t("catalog.admin.col.lessons")}: ${report.lessons.inserted} ${t("catalog.admin.import.inserted")}, ${report.lessons.updated} ${t("catalog.admin.import.updated")}, ${report.lessons.unchanged} ${t("catalog.admin.import.unchanged")}, ${report.lessons.notInFile} ${t("catalog.admin.import.notInFile")}`}</p>
          <p>{`${report.rejectedTotal} ${t("catalog.admin.import.rejected")} · ${report.pendingLanguage} ${t("catalog.admin.import.pending")}`}</p>
          {report.rejected.map((r) => (
            <p
              key={`${r.kind}${r.ref}`}
              className="break-all text-muted-foreground"
            >{`${r.reason} · ${r.ref}`}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
