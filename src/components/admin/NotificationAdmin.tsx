/**
 * Fase 4.1 — Admin Notification Center UI. Every number comes from the database (RPCs / RLS);
 * actions the caller's role cannot perform are not offered (the server refuses them anyway).
 * In-app only: e-mail, push and SMS are documented, not wired.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { useI18n, useT, type TranslationKey } from "@/i18n";
import { fill } from "@/lib/format";
import {
  BODY_MAX,
  CAMPAIGN_KINDS,
  CAMPAIGN_LOCALES,
  EMPTY_SEGMENT,
  KIND_CATEGORY,
  SEGMENT_FIELDS,
  TITLE_MAX,
  availableActions,
  readRate,
  segmentValid,
  type CampaignAction,
  type CampaignError,
  type CampaignKind,
  type CampaignLocale,
  type SegmentField,
  type SegmentRule,
  type SegmentSpec,
} from "@/lib/notifications/campaigns";
import {
  approveCampaignTranslation,
  estimateAudience,
  getCampaignStats,
  getNotificationAdminDashboard,
  listCampaigns,
  listSegments,
  runCampaignAction,
  saveCampaign,
  saveCampaignTranslation,
  saveSegment,
  testSendCampaign,
  type CampaignView,
} from "@/lib/notifications/campaigns.functions";
import { cn } from "@/lib/utils";

/** Internal destinations a campaign may open (the database accepts only internal paths). */
export const CAMPAIGN_LINKS = [
  "/notifications",
  "/dashboard",
  "/analysis",
  "/performance",
  "/player-dna",
  "/goals",
  "/coach",
  "/training",
  "/upload",
  "/profile",
] as const;

const KEY = ["admin", "notifications"] as const;
const inputCls =
  "mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground";

function useErrorText() {
  const t = useT();
  return (e: CampaignError | null | undefined) =>
    e ? t(`adminNotify.error.${e}` as TranslationKey) : "";
}

// ------------------------------------------------------------------ dashboard
const DAY = 86_400_000;

export function NotificationDashboard() {
  const t = useT();
  const { intlTag } = useI18n();
  const [days, setDays] = useState(30);
  const range = useMemo(() => {
    const to = new Date(Date.now() + 60_000);
    return { from: new Date(to.getTime() - days * DAY).toISOString(), to: to.toISOString() };
  }, [days]);
  const dash = useQuery({
    queryKey: [...KEY, "dashboard", days],
    queryFn: () => getNotificationAdminDashboard({ data: range }),
  });
  const err = useErrorText();
  const nf = new Intl.NumberFormat(intlTag);
  if (dash.isPending) return <LoadingState label={t("common.loading")} />;
  if (dash.isError || !dash.data.ok)
    return (
      <ErrorState
        title={t("common.errorTitle")}
        description={dash.data && !dash.data.ok ? err(dash.data.error) : t("admin.error.generic")}
      />
    );
  const d = dash.data.value;
  const rate = readRate(d.read, d.delivered_in_app);
  const total = (status: string) =>
    d.events.filter((e) => e.status === status).reduce((s, e) => s + Number(e.events), 0);
  return (
    <section className="space-y-4" aria-label={t("adminNotify.tab.dashboard")}>
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("adminNotify.range")}
      >
        {[7, 30, 90].map((n) => (
          <Button
            key={n}
            size="sm"
            variant={days === n ? "default" : "outline"}
            aria-pressed={days === n}
            onClick={() => setDays(n)}
          >
            {fill(t("adminNotify.rangeDays"), { n })}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("adminNotify.stat.activeAccounts")} value={nf.format(d.active_accounts)} />
        <Stat
          label={t("adminNotify.stat.created")}
          value={nf.format(total("ACCEPTED") + total("SUPPRESSED") + total("REJECTED"))}
        />
        <Stat label={t("adminNotify.stat.delivered")} value={nf.format(d.delivered_in_app)} />
        <Stat
          label={t("adminNotify.stat.readRate")}
          value={rate === null ? t("adminNotify.notApplicable") : `${rate}%`}
          hint={fill(t("adminNotify.stat.readOf"), {
            read: nf.format(d.read),
            delivered: nf.format(d.delivered_in_app),
          })}
        />
        <Stat label={t("adminNotify.stat.suppressed")} value={nf.format(total("SUPPRESSED"))} />
        <Stat label={t("adminNotify.stat.rejected")} value={nf.format(total("REJECTED"))} />
        <Stat
          label={t("adminNotify.stat.marketingConsents")}
          value={nf.format(d.marketing_consents)}
        />
        <Stat
          label={t("adminNotify.stat.retention")}
          value={d.last_retention_run ? d.last_retention_run.status : t("adminNotify.notYet")}
          hint={
            d.last_retention_run
              ? new Date(d.last_retention_run.started_at).toLocaleString(intlTag)
              : undefined
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("adminNotify.deliveryNote")}</p>
      {d.events.length === 0 ? (
        <EmptyState title={t("adminNotify.noEvents")} description={t("adminNotify.noEventsHint")} />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("adminNotify.eventsTable")}</caption>
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t("adminNotify.col.category")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("adminNotify.col.status")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("adminNotify.col.reason")}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {t("adminNotify.col.events")}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.events.map((e, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">{t(`notify.cat.${e.category}` as TranslationKey)}</td>
                  <td className="px-3 py-2">
                    {t(`adminNotify.eventStatus.${e.status}` as TranslationKey)}
                  </td>
                  <td className="px-3 py-2">
                    {e.reason ? t(`adminNotify.reason.${e.reason}` as TranslationKey) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {nf.format(Number(e.events))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ segment builder
const DEFAULT_RULE: Record<SegmentField, SegmentRule> = {
  locale: { field: "locale", op: "in", value: ["pt-BR"] },
  country: { field: "country", op: "in", value: ["BR"] },
  account_age_days: { field: "account_age_days", op: "gte", value: 7 },
  last_login_days: { field: "last_login_days", op: "lte", value: 30 },
  processed_demos: { field: "processed_demos", op: "gte", value: 1 },
  steam_linked: { field: "steam_linked", op: "eq", value: true },
  has_goal: { field: "has_goal", op: "eq", value: true },
  marketing_consent: { field: "marketing_consent", op: "eq", value: true },
};

export function SegmentBuilder({
  value,
  onChange,
  depth = 0,
  disabled,
}: {
  value: SegmentSpec;
  onChange: (s: SegmentSpec) => void;
  depth?: number;
  disabled?: boolean | undefined;
}) {
  const t = useT();
  const set = (i: number, r: SegmentRule | SegmentSpec) =>
    onChange({ ...value, rules: value.rules.map((x, j) => (j === i ? r : x)) });
  const remove = (i: number) =>
    onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) });
  return (
    <fieldset
      className={cn("space-y-2 rounded-md border border-border p-3", depth && "bg-secondary/30")}
      disabled={disabled}
    >
      <legend className="px-1 text-xs font-medium">
        {depth ? t("adminNotify.segment.group") : t("adminNotify.segment.title")}
      </legend>
      <label className="flex items-center gap-2 text-xs">
        {t("adminNotify.segment.combine")}
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          value={value.op}
          onChange={(e) => onChange({ ...value, op: e.target.value as "AND" | "OR" })}
        >
          <option value="AND">{t("adminNotify.segment.AND")}</option>
          <option value="OR">{t("adminNotify.segment.OR")}</option>
        </select>
      </label>
      {value.rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {value.op === "AND"
            ? t("adminNotify.segment.emptyAll")
            : t("adminNotify.segment.emptyNone")}
        </p>
      ) : null}
      {value.rules.map((r, i) =>
        "rules" in r ? (
          <div key={i} className="flex items-start gap-2">
            <SegmentBuilder
              value={r}
              onChange={(s) => set(i, s)}
              depth={depth + 1}
              disabled={disabled}
            />
            <RemoveButton onClick={() => remove(i)} />
          </div>
        ) : (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <RuleEditor rule={r} onChange={(x) => set(i, x)} />
            <RemoveButton onClick={() => remove(i)} />
          </div>
        ),
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={value.rules.length >= 20}
          onClick={() => onChange({ ...value, rules: [...value.rules, DEFAULT_RULE.locale] })}
        >
          <Plus className="size-3.5" aria-hidden />
          {t("adminNotify.segment.addRule")}
        </Button>
        {depth === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={value.rules.length >= 20}
            onClick={() =>
              onChange({
                ...value,
                rules: [...value.rules, { op: "OR", rules: [DEFAULT_RULE.locale] }],
              })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            {t("adminNotify.segment.addGroup")}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={t("adminNotify.segment.remove")}
      onClick={onClick}
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}

function RuleEditor({ rule, onChange }: { rule: SegmentRule; onChange: (r: SegmentRule) => void }) {
  const t = useT();
  const def = SEGMENT_FIELDS[rule.field];
  return (
    <>
      <label className="text-xs">
        {t("adminNotify.segment.field")}
        <select
          className={inputCls}
          value={rule.field}
          onChange={(e) => onChange(DEFAULT_RULE[e.target.value as SegmentField])}
        >
          {(Object.keys(SEGMENT_FIELDS) as SegmentField[]).map((f) => (
            <option key={f} value={f}>
              {t(`adminNotify.field.${f}` as TranslationKey)}
            </option>
          ))}
        </select>
      </label>
      {def.ops.length > 1 ? (
        <label className="text-xs">
          {t("adminNotify.segment.operator")}
          <select
            className={inputCls}
            value={rule.op}
            onChange={(e) => onChange({ ...rule, op: e.target.value as SegmentRule["op"] })}
          >
            {def.ops.map((o) => (
              <option key={o} value={o}>
                {t(`adminNotify.op.${o}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="min-w-40 flex-1 text-xs">
        {t("adminNotify.segment.value")}
        {def.value === "boolean" ? (
          <select
            className={inputCls}
            value={String(rule.value)}
            onChange={(e) => onChange({ ...rule, value: e.target.value === "true" })}
          >
            <option value="true">{t("adminNotify.yes")}</option>
            <option value="false">{t("adminNotify.no")}</option>
          </select>
        ) : def.value === "locales" ? (
          <select
            multiple
            className={inputCls}
            value={rule.value as string[]}
            onChange={(e) =>
              onChange({ ...rule, value: [...e.target.selectedOptions].map((o) => o.value) })
            }
          >
            {CAMPAIGN_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : def.value === "countries" ? (
          <input
            className={inputCls}
            value={(rule.value as string[]).join(", ")}
            placeholder="BR, PT"
            onChange={(e) =>
              onChange({
                ...rule,
                value: e.target.value
                  .split(",")
                  .map((x) => x.trim().toUpperCase())
                  .filter(Boolean),
              })
            }
          />
        ) : (
          <input
            type="number"
            min={0}
            max={def.value === "count" ? 10000 : 3650}
            className={inputCls}
            value={Number(rule.value)}
            onChange={(e) =>
              onChange({ ...rule, value: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        )}
      </label>
    </>
  );
}

function SavedAudiencePicker({ onPick }: { onPick: (s: SegmentSpec) => void }) {
  const t = useT();
  const segments = useQuery({ queryKey: [...KEY, "segments"], queryFn: () => listSegments() });
  const list = segments.data?.ok ? segments.data.value : [];
  if (!list.length) return null;
  return (
    <label className="block text-xs font-medium">
      {t("adminNotify.useAudience")}
      <select
        className={inputCls}
        value=""
        onChange={(e) => {
          const s = list.find((x) => x.id === e.target.value);
          if (s) onPick(s.spec);
        }}
      >
        <option value="">{t("adminNotify.chooseAudience")}</option>
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AudienceEstimate({ spec, kind }: { spec: SegmentSpec; kind: CampaignKind }) {
  const t = useT();
  const err = useErrorText();
  const valid = segmentValid(spec);
  const est = useQuery({
    queryKey: [...KEY, "estimate", JSON.stringify(spec), kind],
    queryFn: () => estimateAudience({ data: { spec, kind } }),
    enabled: valid,
  });
  return (
    <p className="text-xs" role="status" aria-live="polite">
      {!valid
        ? t("adminNotify.segment.invalid")
        : est.isPending
          ? t("common.loading")
          : est.data?.ok
            ? fill(
                t(kind === "commercial" ? "adminNotify.estimateConsent" : "adminNotify.estimate"),
                {
                  n: est.data.value,
                },
              )
            : err(est.data && !est.data.ok ? est.data.error : "FAILED")}
    </p>
  );
}

// ------------------------------------------------------------------ campaigns
export function CampaignManager({ level }: { level: number }) {
  const t = useT();
  const { intlTag } = useI18n();
  const err = useErrorText();
  const campaigns = useQuery({ queryKey: [...KEY, "campaigns"], queryFn: () => listCampaigns() });
  const [selected, setSelected] = useState<string | null>(null);
  if (campaigns.isPending) return <LoadingState label={t("common.loading")} />;
  if (campaigns.isError || !campaigns.data.ok)
    return (
      <ErrorState
        title={t("common.errorTitle")}
        description={
          campaigns.data && !campaigns.data.ok
            ? err(campaigns.data.error)
            : t("admin.error.generic")
        }
      />
    );
  const list = campaigns.data.value;
  const current = list.find((c) => c.id === selected) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section aria-label={t("adminNotify.tab.campaigns")} className="space-y-2">
        <Button size="sm" onClick={() => setSelected("new")}>
          <Plus className="size-3.5" aria-hidden />
          {t("adminNotify.newCampaign")}
        </Button>
        {list.length === 0 ? (
          <EmptyState
            title={t("adminNotify.noCampaigns")}
            description={t("adminNotify.noCampaignsHint")}
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={selected === c.id}
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-secondary/60",
                    selected === c.id && "bg-secondary",
                  )}
                >
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`adminNotify.status.${c.status}` as TranslationKey)} ·{" "}
                    {t(`adminNotify.kind.${c.kind}` as TranslationKey)} ·{" "}
                    {new Date(c.updatedAt).toLocaleDateString(intlTag)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div>
        {selected === "new" ? (
          <NewCampaign onCreated={(id) => setSelected(id)} />
        ) : current ? (
          <CampaignEditor
            key={`${current.id}:${current.version}`}
            campaign={current}
            level={level}
            onSelect={setSelected}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("adminNotify.selectCampaign")}</p>
        )}
      </div>
    </div>
  );
}

function NewCampaign({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useT();
  const err = useErrorText();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CampaignKind>("product");
  const create = useMutation({
    mutationFn: () => saveCampaign({ data: { id: null, patch: { name, kind } } }),
    onSuccess: async (r) => {
      if (r.ok) {
        await queryClient.invalidateQueries({ queryKey: [...KEY, "campaigns"] });
        onCreated(r.value.id);
      }
    },
  });
  return (
    <section
      className="space-y-3 rounded-md border border-border p-4"
      aria-label={t("adminNotify.newCampaign")}
    >
      <h2 className="text-sm font-semibold">{t("adminNotify.newCampaign")}</h2>
      <label className="block text-xs font-medium">
        {t("adminNotify.field.name")}
        <input
          className={inputCls}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <KindSelect value={kind} onChange={setKind} />
      <Button
        size="sm"
        disabled={name.trim().length < 3 || create.isPending}
        onClick={() => create.mutate()}
      >
        {t("adminNotify.createDraft")}
      </Button>
      <p role="status" className="text-xs text-destructive">
        {create.data && !create.data.ok ? err(create.data.error) : ""}
      </p>
    </section>
  );
}

function KindSelect({
  value,
  onChange,
  disabled,
}: {
  value: CampaignKind;
  onChange: (k: CampaignKind) => void;
  disabled?: boolean | undefined;
}) {
  const t = useT();
  return (
    <label className="block text-xs font-medium">
      {t("adminNotify.field.kind")}
      <select
        className={inputCls}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as CampaignKind)}
      >
        {CAMPAIGN_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`adminNotify.kind.${k}` as TranslationKey)}
          </option>
        ))}
      </select>
      <span className="mt-1 block font-normal text-muted-foreground">
        {t(`adminNotify.kindHint.${value}` as TranslationKey)}
      </span>
    </label>
  );
}

export function CampaignEditor({
  campaign,
  level,
  onSelect,
}: {
  campaign: CampaignView;
  level: number;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const err = useErrorText();
  const queryClient = useQueryClient();
  const editable = campaign.status === "DRAFT";
  const [name, setName] = useState(campaign.name);
  const [kind, setKind] = useState<CampaignKind>(campaign.kind);
  const [sourceLocale, setSourceLocale] = useState<CampaignLocale>(campaign.sourceLocale);
  const [link, setLink] = useState(campaign.link);
  const [segment, setSegment] = useState<SegmentSpec>(campaign.segment ?? EMPTY_SEGMENT);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const report = (r: { ok: boolean; error?: CampaignError }, okText: string) => {
    setMessage(r.ok ? { kind: "ok", text: okText } : { kind: "error", text: err(r.error) });
    void refresh();
  };

  const save = useMutation({
    mutationFn: () =>
      saveCampaign({
        data: {
          id: campaign.id,
          version: campaign.version,
          patch: { name, kind, source_locale: sourceLocale, link, segment },
        },
      }),
    onSuccess: (r) => report(r, t("adminNotify.saved")),
  });
  const test = useMutation({
    mutationFn: () => testSendCampaign({ data: { id: campaign.id } }),
    onSuccess: (r) =>
      report(
        r,
        r.ok
          ? r.value.accepted
            ? t("adminNotify.testSent")
            : t("adminNotify.testSuppressed")
          : "",
      ),
  });
  const act = useMutation({
    mutationFn: (v: {
      action: CampaignAction;
      args?: { confirm_audience?: number; scheduled_at?: string };
    }) =>
      runCampaignAction({
        data: { id: campaign.id, action: v.action, version: campaign.version, args: v.args ?? {} },
      }),
    onSuccess: (r, v) => {
      report(r, t(`adminNotify.done.${v.action}` as TranslationKey));
      if (r.ok && v.action === "duplicate") onSelect(r.value.id);
    },
  });
  const actions = availableActions(campaign.status, level).filter((a) => a !== "schedule");
  const canSchedule = availableActions(campaign.status, level).includes("schedule");

  return (
    <article className="space-y-4 rounded-md border border-border p-4" aria-label={campaign.name}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{campaign.name}</h2>
        <span className="rounded-sm border border-border px-2 py-0.5 text-xs">
          {t(`adminNotify.status.${campaign.status}` as TranslationKey)}
        </span>
      </header>
      {!editable ? (
        <p className="text-xs text-muted-foreground">{t("adminNotify.lockedHint")}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          {t("adminNotify.field.name")}
          <input
            className={inputCls}
            value={name}
            disabled={!editable}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <KindSelect value={kind} onChange={setKind} disabled={!editable} />
        <label className="block text-xs font-medium">
          {t("adminNotify.field.sourceLocale")}
          <select
            className={inputCls}
            value={sourceLocale}
            disabled={!editable}
            onChange={(e) => setSourceLocale(e.target.value as CampaignLocale)}
          >
            {CAMPAIGN_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium">
          {t("adminNotify.field.link")}
          <select
            className={inputCls}
            value={link}
            disabled={!editable}
            onChange={(e) => setLink(e.target.value)}
          >
            {CAMPAIGN_LINKS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {editable ? <SavedAudiencePicker onPick={setSegment} /> : null}
      <SegmentBuilder value={segment} onChange={setSegment} disabled={!editable} />
      <AudienceEstimate spec={segment} kind={kind} />
      <p className="text-xs text-muted-foreground">
        {fill(t("adminNotify.deliveredAs"), {
          category: t(`notify.cat.${KIND_CATEGORY[kind]}` as TranslationKey),
        })}
      </p>
      {editable ? (
        <Button
          size="sm"
          disabled={save.isPending || !segmentValid(segment) || name.trim().length < 3}
          onClick={() => save.mutate()}
        >
          {t("adminNotify.saveDraft")}
        </Button>
      ) : null}

      <Translations campaign={campaign} level={level} onResult={report} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          <Send className="size-3.5" aria-hidden />
          {t("adminNotify.testSend")}
        </Button>
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "cancel" ? "destructive" : "outline"}
            disabled={act.isPending}
            onClick={() => act.mutate({ action: a })}
          >
            {t(`adminNotify.action.${a}` as TranslationKey)}
          </Button>
        ))}
      </div>
      {canSchedule ? (
        <ScheduleBox
          campaign={campaign}
          busy={act.isPending}
          onConfirm={(args) => act.mutate({ action: "schedule", args })}
        />
      ) : null}
      {message ? (
        <p
          role="status"
          className={cn(
            "text-sm",
            message.kind === "error" ? "text-destructive" : "text-foreground",
          )}
        >
          {message.text}
        </p>
      ) : null}
      {["SENDING", "PAUSED", "SENT", "CANCELLED", "FAILED", "ARCHIVED"].includes(
        campaign.status,
      ) ? (
        <CampaignStatsPanel campaign={campaign} />
      ) : null}
    </article>
  );
}

function Translations({
  campaign,
  level,
  onResult,
}: {
  campaign: CampaignView;
  level: number;
  onResult: (r: { ok: boolean; error?: CampaignError }, okText: string) => void;
}) {
  const t = useT();
  const [locale, setLocale] = useState<CampaignLocale>(campaign.sourceLocale);
  const existing = campaign.translations.find((x) => x.locale === locale);
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>(() =>
    Object.fromEntries(
      campaign.translations.map((x) => [x.locale, { title: x.title, body: x.body }]),
    ),
  );
  const draft = drafts[locale] ?? { title: "", body: "" };
  const editable = campaign.status === "DRAFT";
  const dirty =
    !existing || existing.title !== draft.title.trim() || existing.body !== draft.body.trim();
  const saveText = useMutation({
    mutationFn: () =>
      saveCampaignTranslation({
        data: { campaignId: campaign.id, locale, title: draft.title, body: draft.body },
      }),
    onSuccess: (r) => onResult(r, t("adminNotify.textSaved")),
  });
  const approve = useMutation({
    mutationFn: () => approveCampaignTranslation({ data: { campaignId: campaign.id, locale } }),
    onSuccess: (r) => onResult(r, t("adminNotify.textApproved")),
  });
  return (
    <section className="space-y-3" aria-label={t("adminNotify.texts")}>
      <h3 className="text-sm font-semibold">{t("adminNotify.texts")}</h3>
      <p className="text-xs text-muted-foreground">{t("adminNotify.textsHint")}</p>
      <div role="tablist" aria-label={t("adminNotify.texts")} className="flex flex-wrap gap-1">
        {CAMPAIGN_LOCALES.map((l) => {
          const tr = campaign.translations.find((x) => x.locale === l);
          return (
            <button
              key={l}
              role="tab"
              type="button"
              aria-selected={locale === l}
              onClick={() => setLocale(l)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                locale === l ? "border-primary/50 bg-primary/10" : "border-border",
              )}
            >
              {l} ·{" "}
              {tr
                ? tr.approved
                  ? t("adminNotify.approved")
                  : t("adminNotify.pendingReview")
                : t("adminNotify.missing")}
              {l === campaign.sourceLocale ? ` (${t("adminNotify.source")})` : ""}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-xs font-medium">
            {t("adminNotify.field.title")} ({draft.title.length}/{TITLE_MAX})
            <input
              className={inputCls}
              value={draft.title}
              maxLength={TITLE_MAX}
              disabled={!editable}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [locale]: { ...draft, title: e.target.value } }))
              }
            />
          </label>
          <label className="block text-xs font-medium">
            {t("adminNotify.field.body")} ({draft.body.length}/{BODY_MAX})
            <textarea
              className={cn(inputCls, "min-h-24")}
              value={draft.body}
              maxLength={BODY_MAX}
              disabled={!editable}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [locale]: { ...draft, body: e.target.value } }))
              }
            />
          </label>
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!dirty || !draft.title.trim() || !draft.body.trim() || saveText.isPending}
                onClick={() => saveText.mutate()}
              >
                {t("adminNotify.saveText")}
              </Button>
              {level >= 2 ? (
                <Button
                  size="sm"
                  disabled={!existing || existing.approved || dirty || approve.isPending}
                  onClick={() => approve.mutate()}
                >
                  {t("adminNotify.approveText")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          aria-label={t("adminNotify.preview")}
          className="rounded-md border border-dashed border-border p-3"
        >
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("adminNotify.preview")}
          </p>
          <p className="mt-2 text-sm font-medium">{draft.title || t("adminNotify.field.title")}</p>
          <p className="text-sm text-muted-foreground">
            {draft.body || t("adminNotify.field.body")}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">{campaign.link}</p>
        </div>
      </div>
    </section>
  );
}

function ScheduleBox({
  campaign,
  busy,
  onConfirm,
}: {
  campaign: CampaignView;
  busy: boolean;
  onConfirm: (args: { confirm_audience: number; scheduled_at?: string }) => void;
}) {
  const t = useT();
  const [when, setWhen] = useState("");
  const [typed, setTyped] = useState("");
  // The SAVED segment and kind: the server confirms against exactly what will be sent.
  const est = useQuery({
    queryKey: [...KEY, "estimate", JSON.stringify(campaign.segment), campaign.kind, "schedule"],
    queryFn: () => estimateAudience({ data: { spec: campaign.segment, kind: campaign.kind } }),
  });
  const audience = est.data?.ok ? est.data.value : null;
  const approvedSource = campaign.translations.some(
    (x) => x.locale === campaign.sourceLocale && x.approved,
  );
  const matches = audience !== null && typed.trim() === String(audience);
  return (
    <section
      className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3"
      aria-label={t("adminNotify.schedule")}
    >
      <h3 className="text-sm font-semibold">{t("adminNotify.schedule")}</h3>
      {!approvedSource ? (
        <p className="text-xs text-destructive">{t("adminNotify.needsApproval")}</p>
      ) : null}
      <p className="text-xs">
        {audience === null
          ? t("common.loading")
          : fill(t("adminNotify.confirmPrompt"), { n: audience })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          {t("adminNotify.when")}
          <input
            type="datetime-local"
            className={inputCls}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <span className="block font-normal text-muted-foreground">
            {t("adminNotify.whenHint")}
          </span>
        </label>
        <label className="block text-xs font-medium">
          {t("adminNotify.confirmLabel")}
          <input
            inputMode="numeric"
            className={inputCls}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>
      <Button
        size="sm"
        disabled={busy || !approvedSource || !matches || audience === 0}
        onClick={() =>
          onConfirm({
            confirm_audience: audience ?? -1,
            ...(when ? { scheduled_at: new Date(when).toISOString() } : {}),
          })
        }
      >
        {when ? t("adminNotify.scheduleAt") : t("adminNotify.sendNow")}
      </Button>
    </section>
  );
}

function CampaignStatsPanel({ campaign }: { campaign: CampaignView }) {
  const t = useT();
  const { intlTag } = useI18n();
  const nf = new Intl.NumberFormat(intlTag);
  const stats = useQuery({
    queryKey: [...KEY, "stats", campaign.id, campaign.version, campaign.targeted],
    queryFn: () => getCampaignStats({ data: { id: campaign.id } }),
  });
  if (stats.isPending) return <LoadingState label={t("common.loading")} />;
  if (!stats.data?.ok) return null;
  const s = stats.data.value;
  const rate = readRate(s.read, s.delivered_in_app);
  return (
    <section className="space-y-2" aria-label={t("adminNotify.results")}>
      <h3 className="text-sm font-semibold">{t("adminNotify.results")}</h3>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat
          label={t("adminNotify.stat.targeted")}
          value={nf.format(campaign.targeted)}
          hint={
            campaign.confirmedAudience === null
              ? undefined
              : fill(t("adminNotify.stat.confirmed"), { n: campaign.confirmedAudience })
          }
        />
        <Stat label={t("adminNotify.stat.created")} value={nf.format(s.created)} />
        <Stat label={t("adminNotify.stat.accepted")} value={nf.format(s.accepted)} />
        <Stat label={t("adminNotify.stat.delivered")} value={nf.format(s.delivered_in_app)} />
        <Stat
          label={t("adminNotify.stat.readRate")}
          value={rate === null ? t("adminNotify.notApplicable") : `${rate}%`}
          hint={fill(t("adminNotify.stat.readOf"), {
            read: nf.format(s.read),
            delivered: nf.format(s.delivered_in_app),
          })}
        />
        <Stat label={t("adminNotify.stat.suppressed")} value={nf.format(s.suppressed)} />
        <Stat label={t("adminNotify.stat.rejected")} value={nf.format(s.rejected)} />
        <Stat
          label={t("adminNotify.stat.deletedByPlayer")}
          value={nf.format(s.deleted_by_player)}
        />
      </div>
      {Object.keys(s.by_reason).length ? (
        <ul className="text-xs text-muted-foreground">
          {Object.entries(s.by_reason).map(([reason, n]) => (
            <li key={reason}>
              {t(`adminNotify.reason.${reason}` as TranslationKey)}: {nf.format(n)}
            </li>
          ))}
        </ul>
      ) : null}
      {campaign.lastError ? (
        <p className="text-xs text-destructive">
          {fill(t("adminNotify.lastError"), { code: campaign.lastError, n: campaign.failures })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("adminNotify.deliveryNote")}</p>
    </section>
  );
}

// ------------------------------------------------------------------ saved audiences
export function AudienceManager() {
  const t = useT();
  const { intlTag } = useI18n();
  const err = useErrorText();
  const queryClient = useQueryClient();
  const segments = useQuery({ queryKey: [...KEY, "segments"], queryFn: () => listSegments() });
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<SegmentSpec>(EMPTY_SEGMENT);
  const save = useMutation({
    mutationFn: (v: { id: string | null; name: string; spec: SegmentSpec }) =>
      saveSegment({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "segments"] }),
  });
  if (segments.isPending) return <LoadingState label={t("common.loading")} />;
  if (segments.isError || !segments.data.ok)
    return (
      <ErrorState
        title={t("common.errorTitle")}
        description={
          segments.data && !segments.data.ok ? err(segments.data.error) : t("admin.error.generic")
        }
      />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2" aria-label={t("adminNotify.tab.audiences")}>
        {segments.data.value.length === 0 ? (
          <EmptyState
            title={t("adminNotify.noAudiences")}
            description={t("adminNotify.noAudiencesHint")}
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {segments.data.value.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.estimatedCount === null
                      ? t("adminNotify.notYet")
                      : fill(t("adminNotify.estimatedAt"), {
                          n: s.estimatedCount,
                          date: s.estimatedAt
                            ? new Date(s.estimatedAt).toLocaleString(intlTag)
                            : "—",
                        })}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ id: s.id, name: s.name, spec: s.spec })}
                >
                  {t("adminNotify.recalculate")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        className="space-y-3 rounded-md border border-border p-4"
        aria-label={t("adminNotify.newAudience")}
      >
        <h2 className="text-sm font-semibold">{t("adminNotify.newAudience")}</h2>
        <label className="block text-xs font-medium">
          {t("adminNotify.field.name")}
          <input
            className={inputCls}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <SegmentBuilder value={spec} onChange={setSpec} />
        <AudienceEstimate spec={spec} kind="operational" />
        <Button
          size="sm"
          disabled={name.trim().length < 3 || !segmentValid(spec) || save.isPending}
          onClick={() => save.mutate({ id: null, name, spec })}
        >
          {t("adminNotify.saveAudience")}
        </Button>
        <p role="status" className="text-xs text-destructive">
          {save.data && !save.data.ok ? err(save.data.error) : ""}
        </p>
      </section>
    </div>
  );
}
