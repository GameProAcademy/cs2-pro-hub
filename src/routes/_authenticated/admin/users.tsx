import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { UserDetailDialog } from "@/components/admin/UserDetailDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { UserAvatar } from "@/components/common/UserAvatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, useT } from "@/i18n";
import {
  bulkSetAdminUserStatus,
  listAdminUsers,
  type AccountStatus,
  type AdminRole,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Usuários — Administração CS2 PRO AI COACH" },
      {
        name: "description",
        content: "Gestão de contas, roles e status dos usuários do CS2 PRO AI COACH.",
      },
      { property: "og:title", content: "Usuários — Administração CS2 PRO AI COACH" },
      { property: "og:description", content: "Busca, filtros e edição segura de usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminUsersPage,
});

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: AccountStatus }) {
  const t = useT();
  return (
    <span
      className={
        status === "active"
          ? "rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary"
          : "rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      }
    >
      {t(`admin.status.${status}`)}
    </span>
  );
}

function AdminUsersPage() {
  const t = useT();
  const { intlTag } = useI18n();
  const { adminSession } = Route.useRouteContext();
  const dateFormat = new Intl.DateTimeFormat(intlTag, { dateStyle: "short" });

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<AdminRole | "all">("all");
  const [status, setStatus] = useState<AccountStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // FASE 2.5.1 — bulk selection lives in the page, scoped to the visible page.
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);
  // FASE 2.5.2 — a bulk mutation NEVER runs on a single click: the operator has
  // to confirm the exact action and the exact number of accounts.
  const [bulkConfirm, setBulkConfirm] = useState<AccountStatus | null>(null);

  const users = useQuery({
    queryKey: ["admin", "users", { search, role, status, page }],
    queryFn: () => listAdminUsers({ data: { search, role, status, page, pageSize: PAGE_SIZE } }),
  });

  const rows = users.data?.rows ?? [];
  const selectableIds = rows.filter((row) => row.role === "player").map((row) => row.id);
  const selectedOnPage = checked.filter((id) => selectableIds.includes(id));
  const allSelected = selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  function toggleOne(id: string) {
    setBulkSummary(null);
    setChecked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setBulkSummary(null);
    setChecked(allSelected ? [] : selectableIds);
  }

  async function runBulk(status: AccountStatus) {
    if (selectedOnPage.length === 0) return;
    setBulkConfirm(null);
    setBulkBusy(true);
    setBulkSummary(null);
    try {
      const result = await bulkSetAdminUserStatus({ data: { userIds: selectedOnPage, status } });
      // Honest, per-outcome summary — never a blanket "success".
      setBulkSummary(
        `${result.applied} ${t("admin.bulk.applied")} · ${result.skipped} ${t("admin.bulk.skipped")} · ${result.failed} ${t("admin.bulk.failed")}`,
      );
      setChecked([]);
      await users.refetch();
    } catch {
      setBulkSummary(t("admin.bulk.limitExceeded"));
    } finally {
      setBulkBusy(false);
    }
  }

  const total = users.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dash = t("admin.value.none");

  return (
    <AdminShell session={adminSession}>
      <PageHeader
        eyebrow={t("admin.area")}
        title={t("admin.users.title")}
        description={t("admin.users.subtitle")}
        actions={
          <Button className="gap-2" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t("admin.action.createUser")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="search" className="sr-only">
            {t("admin.filter.searchPlaceholder")}
          </Label>
          <Input
            id="search"
            value={search}
            placeholder={t("admin.filter.searchPlaceholder")}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="role-filter" className="sr-only">
            {t("admin.filter.role")}
          </Label>
          <select
            id="role-filter"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as AdminRole | "all");
              setPage(1);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{`${t("admin.filter.role")}: ${t("admin.filter.all")}`}</option>
            <option value="player">{t("admin.role.player")}</option>
            <option value="admin_master">{t("admin.role.admin_master")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="status-filter" className="sr-only">
            {t("admin.filter.status")}
          </Label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AccountStatus | "all");
              setPage(1);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{`${t("admin.filter.status")}: ${t("admin.filter.all")}`}</option>
            <option value="active">{t("admin.status.active")}</option>
            <option value="inactive">{t("admin.status.inactive")}</option>
          </select>
        </div>
      </div>

      {selectedOnPage.length > 0 || bulkSummary ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {`${selectedOnPage.length} ${t("admin.bulk.selected")}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy || selectedOnPage.length === 0}
            onClick={() => setBulkConfirm("active")}
          >
            {t("admin.bulk.activate")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy || selectedOnPage.length === 0}
            onClick={() => setBulkConfirm("inactive")}
          >
            {t("admin.bulk.deactivate")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked([])} disabled={bulkBusy}>
            {t("admin.bulk.clear")}
          </Button>
          {bulkConfirm ? (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-card/60 p-2">
              <span className="text-xs text-foreground">
                {t(
                  bulkConfirm === "active"
                    ? "admin.bulk.confirmActivate"
                    : "admin.bulk.confirmDeactivate",
                ).replace("{count}", String(selectedOnPage.length))}
              </span>
              <Button
                size="sm"
                variant={bulkConfirm === "active" ? "default" : "destructive"}
                disabled={bulkBusy}
                onClick={() => void runBulk(bulkConfirm)}
              >
                {t("admin.bulk.confirm")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm(null)}
              >
                {t("admin.bulk.cancel")}
              </Button>
            </div>
          ) : null}
          {bulkSummary ? (
            <span className="font-mono text-xs text-muted-foreground">{bulkSummary}</span>
          ) : null}
        </div>
      ) : null}

      {users.isLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : users.isError ? (
        <ErrorState
          title={t("common.errorTitle")}
          description={t("admin.error.generic")}
          onRetry={() => void users.refetch()}
        />
      ) : (users.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title={t("common.emptyTitle")} description={t("admin.empty.users")} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={t("admin.bulk.selectAll")}
                      checked={allSelected}
                      ref={(node) => {
                        if (node) node.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="size-4 accent-primary"
                    />
                  </th>
                  <th className="px-3 py-2">{t("admin.detail.avatar")}</th>
                  <th className="px-3 py-2">{t("admin.table.name")}</th>
                  <th className="px-3 py-2">{t("admin.table.nickname")}</th>
                  <th className="px-3 py-2">{t("admin.table.email")}</th>
                  <th className="px-3 py-2">{t("admin.table.role")}</th>
                  <th className="px-3 py-2">{t("admin.table.status")}</th>
                  <th className="px-3 py-2">{t("admin.table.country")}</th>
                  <th className="px-3 py-2">{t("admin.table.createdAt")}</th>
                  <th className="px-3 py-2">{t("admin.table.lastLogin")}</th>
                  <th className="px-3 py-2">{t("admin.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data?.rows.map((user) => (
                  <tr key={user.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={t("admin.bulk.select")}
                        // Administrator accounts are never bulk-mutable.
                        disabled={user.role !== "player"}
                        checked={checked.includes(user.id)}
                        onChange={() => toggleOne(user.id)}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UserAvatar
                        source={user.avatar_url}
                        name={user.display_name ?? user.nickname}
                        size={32}
                      />
                    </td>
                    <td className="px-3 py-2 text-foreground">{user.display_name || dash}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.nickname || dash}</td>
                    <td className="px-3 py-2 text-muted-foreground">{user.email || dash}</td>
                    <td className="px-3 py-2">{t(`admin.role.${user.role}`)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{user.country || dash}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {dateFormat.format(new Date(user.created_at))}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {user.last_login_at
                        ? dateFormat.format(new Date(user.last_login_at))
                        : t("admin.value.never")}
                    </td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(user.id)}>
                        {t("admin.action.view")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <ul className="space-y-3 lg:hidden">
            {users.data?.rows.map((user) => (
              <li key={user.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <input
                    type="checkbox"
                    aria-label={t("admin.bulk.select")}
                    disabled={user.role !== "player"}
                    checked={checked.includes(user.id)}
                    onChange={() => toggleOne(user.id)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <UserAvatar
                    source={user.avatar_url}
                    name={user.display_name ?? user.nickname}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {user.display_name || user.nickname || dash}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email || dash}</p>
                  </div>
                  <StatusBadge status={user.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="font-mono uppercase tracking-wider">{t("admin.table.role")}</dt>
                    <dd className="text-foreground">{t(`admin.role.${user.role}`)}</dd>
                  </div>
                  <div>
                    <dt className="font-mono uppercase tracking-wider">
                      {t("admin.table.country")}
                    </dt>
                    <dd className="text-foreground">{user.country || dash}</dd>
                  </div>
                  <div>
                    <dt className="font-mono uppercase tracking-wider">
                      {t("admin.table.createdAt")}
                    </dt>
                    <dd className="text-foreground">
                      {dateFormat.format(new Date(user.created_at))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono uppercase tracking-wider">
                      {t("admin.table.lastLogin")}
                    </dt>
                    <dd className="text-foreground">
                      {user.last_login_at
                        ? dateFormat.format(new Date(user.last_login_at))
                        : t("admin.value.never")}
                    </dd>
                  </div>
                </dl>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => setSelected(user.id)}
                >
                  {t("admin.action.view")}
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {`${t("admin.pagination.page")} ${page} ${t("admin.pagination.of")} ${pages} · ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("admin.pagination.prev")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("admin.pagination.next")}
              </Button>
            </div>
          </div>
        </>
      )}

      {selected ? (
        <UserDetailDialog
          userId={selected}
          session={adminSession}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {creating ? <CreateUserDialog onClose={() => setCreating(false)} /> : null}
    </AdminShell>
  );
}
