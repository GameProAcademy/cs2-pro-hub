/**
 * VGL 5.0 — public player profile page and side-by-side comparison. Renders only the
 * whitelisted `PublicProfile` view; a private or unknown id is one and the same state.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { MapArt } from "@/components/cs2/Cs2Art";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, type TranslationKey } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { dnaLabelKey } from "@/lib/dna";
import { fill, formatDate, formatNumber, NOT_AVAILABLE_MARK } from "@/lib/format";
import type { DnaDimension } from "@/types";
import { getPublicProfile, type PublicProfileResult } from "@/lib/publicProfile.functions";
import {
  COMPARE_MIN_MATCHES,
  comparePublicProfiles,
  normalizePublicId,
  type CompareRow,
  type PublicProfile,
} from "@/lib/publicProfile/publicProfile";
import { cn } from "@/lib/utils";

export function usePublicProfile(publicId: string | null | undefined) {
  return useQuery<PublicProfileResult>({
    queryKey: ["public-profile", publicId ?? null],
    queryFn: () => getPublicProfile({ data: { publicId } }),
    enabled: Boolean(publicId),
    staleTime: 60_000,
    retry: false,
  });
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("surface-panel rounded-xl border border-border p-4 sm:p-5", className)}
      aria-label={title}
    >
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StateCard({ title, description }: { title: string; description: string }) {
  const { t } = useI18n();
  return (
    <div
      className="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 text-center"
      data-public-state
    >
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-5">
        <Link to="/register">{t("vgl5.pub.cta")}</Link>
      </Button>
    </div>
  );
}

const pct = (v: number | null, intl: string) =>
  v === null ? NOT_AVAILABLE_MARK : `${formatNumber(v, intl, 0)}%`;

export function formatCompareValue(key: CompareRow["key"], v: number | null, intl: string) {
  if (v === null) return NOT_AVAILABLE_MARK;
  switch (key) {
    case "score":
    case "adr":
      return formatNumber(v, intl, 0);
    case "kast":
    case "hsPercent":
      return pct(v, intl);
    case "winRate":
      return pct(v * 100, intl);
    default:
      return formatNumber(v, intl, 2);
  }
}

function Identity({ p }: { p: PublicProfile }) {
  const { t } = useI18n();
  const name = p.identity.nickname ?? p.identity.publicId;
  const facts = [p.identity.country, p.identity.platform, p.identity.role, p.identity.team].filter(
    (x): x is string => Boolean(x),
  );
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center" data-public-identity>
      <div className="size-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-elevated">
        {p.identity.avatarUrl ? (
          <img src={p.identity.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center font-display text-3xl text-muted-foreground">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          {t("vgl5.pub.eyebrow")}
        </p>
        <h1 className="truncate font-display text-3xl font-semibold sm:text-4xl">{name}</h1>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
          <span className="font-mono text-xs" data-public-id>
            {t("vgl5.pub.id")}: {p.identity.publicId}
          </span>
        </p>
      </div>
    </header>
  );
}

function ScorePanel({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  return (
    <Panel title={t("vgl5.pub.score")}>
      {p.score.value !== null ? (
        <p className="flex items-baseline gap-2" data-public-score>
          <span className="font-display text-6xl font-semibold leading-none tabular-nums">
            {formatNumber(p.score.value, intlTag, 0)}
          </span>
          <span className="font-mono text-muted-foreground">/100</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground" data-public-score-empty>
          {t("vgl5.pub.insufficient")}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {fill(t("vgl5.score.matches"), { n: p.score.matches })}
        {p.score.confidence
          ? ` · ${t(`vgl5.score.conf.${p.score.confidence}` as TranslationKey)}`
          : ""}
      </p>
    </Panel>
  );
}

function DnaPanel({ p }: { p: PublicProfile }) {
  const { t } = useI18n();
  const dims = p.dna.dimensions.filter((d) => d.value !== null);
  return (
    <Panel title={t("vgl5.pub.dna")}>
      {p.dna.state === "READY" && dims.length ? (
        <ul className="space-y-2" data-public-dna>
          {dims
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((d) => (
              <li
                key={d.dimension}
                className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-sm"
              >
                <span className="truncate">{t(dnaLabelKey(d.dimension as DnaDimension))}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${d.value}%` }}
                  />
                </span>
                <span className="text-right font-mono tabular-nums">{d.value}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("vgl5.pub.insufficient")}</p>
      )}
    </Panel>
  );
}

function BestMapPanel({ p }: { p: PublicProfile }) {
  const { t } = useI18n();
  const best = p.maps.best;
  return (
    <Panel title={t("vgl5.pub.bestMap")} className="overflow-hidden p-0 sm:p-0">
      {best ? (
        <MapArt map={best.map} className="min-h-40 p-4 sm:p-5">
          <div className="relative" data-public-best-map>
            <p className="font-display text-3xl font-semibold">{mapDisplayName(best.map)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {fill(t("bestMap.matches"), { n: best.matches })} ·{" "}
              {t(`bestMap.confidence.${best.confidence}` as TranslationKey)}
            </p>
            {p.maps.ranked.length > 1 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {p.maps.ranked.slice(1, 4).map((m) => (
                  <li
                    key={m.map}
                    className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-xs"
                  >
                    {mapDisplayName(m.map)} · {t(`bestMap.short.${m.tier}` as TranslationKey)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </MapArt>
      ) : (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">
          {t("vgl5.pub.insufficient")}
        </p>
      )}
    </Panel>
  );
}

function StatsPanel({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  const cells: Array<[TranslationKey, string]> = [
    ["real.metric.matches", formatNumber(p.stats.matches, intlTag, 0)],
    ["vgl5.pub.metric.rounds", formatNumber(p.stats.rounds, intlTag, 0)],
    ["vgl5.pub.metric.rating", formatCompareValue("rating", p.stats.rating, intlTag)],
    ["vgl5.pub.metric.adr", formatCompareValue("adr", p.stats.adr, intlTag)],
    ["vgl5.pub.metric.kast", formatCompareValue("kast", p.stats.kast, intlTag)],
    ["vgl5.pub.metric.kd", formatCompareValue("kd", p.stats.kd, intlTag)],
    ["vgl5.pub.metric.hsPercent", formatCompareValue("hsPercent", p.stats.hsPercent, intlTag)],
    ["vgl5.pub.metric.winRate", formatCompareValue("winRate", p.stats.winRate, intlTag)],
  ];
  return (
    <Panel title={t("vgl5.pub.stats")}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-public-stats>
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-background/40 p-3">
            <dt className="text-xs text-muted-foreground">{t(k)}</dt>
            <dd className="mt-1 font-display text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function RecentPanel({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  return (
    <Panel title={t("vgl5.pub.recent")}>
      {p.recent.length ? (
        <ul className="divide-y divide-border" data-public-recent>
          {p.recent.map((m, i) => (
            <li
              key={`${m.playedAt}-${i}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
            >
              <span className="min-w-24 font-medium">{mapDisplayName(m.map)}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(m.playedAt, intlTag)}
              </span>
              {m.result ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-semibold",
                    m.result === "win"
                      ? "bg-success/15 text-success"
                      : m.result === "loss"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`vgl5.pub.result.${m.result}` as TranslationKey)}
                </span>
              ) : null}
              <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                {m.kills ?? NOT_AVAILABLE_MARK}/{m.deaths ?? NOT_AVAILABLE_MARK} · ADR{" "}
                {formatNumber(m.adr, intlTag, 0)} · {formatNumber(m.rating, intlTag, 2)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("vgl5.pub.noMatches")}</p>
      )}
    </Panel>
  );
}

function CompareForm({ selfId, vs }: { selfId: string; vs: string | undefined }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState(vs ?? "");
  const [error, setError] = useState<TranslationKey | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = normalizePublicId(value);
    if (!id) return setError("vgl5.pub.invalid.description");
    if (id === selfId) return setError("vgl5.pub.compare.same");
    setError(null);
    void navigate({ to: "/p/$publicId", params: { publicId: selfId }, search: { vs: id } });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" data-public-compare-form>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("vgl5.pub.compare.placeholder")}
        aria-label={t("vgl5.pub.compare.placeholder")}
        maxLength={16}
        autoComplete="off"
        className="sm:max-w-xs"
      />
      <Button type="submit">{t("vgl5.pub.compare.submit")}</Button>
      {vs ? (
        <Button variant="ghost" type="button" asChild>
          <Link to="/p/$publicId" params={{ publicId: selfId }} search={{}}>
            {t("vgl5.pub.compare.clear")}
          </Link>
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:self-center">
          {t(error)}
        </p>
      ) : null}
    </form>
  );
}

function CompareTable({ a, b }: { a: PublicProfile; b: PublicProfile }) {
  const { t, intlTag } = useI18n();
  const rows = comparePublicProfiles(a, b);
  const nameA = a.identity.nickname ?? a.identity.publicId;
  const nameB = b.identity.nickname ?? b.identity.publicId;
  const verdict = (r: CompareRow) => {
    if (r.key === "hsPercent") return t("vgl5.pub.compare.context");
    if (r.verdict === "A") return fill(t("vgl5.pub.compare.ahead"), { name: nameA });
    if (r.verdict === "B") return fill(t("vgl5.pub.compare.ahead"), { name: nameB });
    return t(`vgl5.pub.compare.${r.verdict}` as TranslationKey);
  };
  return (
    <div className="overflow-x-auto" data-public-compare>
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">{t("vgl5.pub.compare.metric")}</th>
            <th className="py-2 pr-2 font-medium">{nameA}</th>
            <th className="py-2 pr-2 font-medium">{nameB}</th>
            <th className="py-2 font-medium">{t("vgl5.pub.compare.verdict")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} data-compare-row={r.key} data-compare-verdict={r.verdict}>
              <th scope="row" className="py-2 pr-2 text-left font-medium">
                {t(`vgl5.pub.metric.${r.key}` as TranslationKey)}
              </th>
              <td
                className={cn(
                  "py-2 pr-2 font-mono tabular-nums",
                  r.verdict === "A" && "font-semibold text-primary",
                )}
              >
                {formatCompareValue(r.key, r.a, intlTag)}
              </td>
              <td
                className={cn(
                  "py-2 pr-2 font-mono tabular-nums",
                  r.verdict === "B" && "font-semibold text-primary",
                )}
              >
                {formatCompareValue(r.key, r.b, intlTag)}
              </td>
              <td className="py-2 text-xs text-muted-foreground">{verdict(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        {fill(t("vgl5.pub.compare.note"), { n: COMPARE_MIN_MATCHES })}
      </p>
    </div>
  );
}

function ComparePanel({ self, vs }: { self: PublicProfile; vs: string | undefined }) {
  const { t } = useI18n();
  const other = usePublicProfile(vs);
  return (
    <Panel title={t("vgl5.pub.compare.title")} className="lg:col-span-2">
      <CompareForm selfId={self.identity.publicId} vs={vs} />
      {vs ? (
        <div className="mt-4">
          {other.isPending ? (
            <p className="text-sm text-muted-foreground">{t("vgl5.pub.loading")}</p>
          ) : other.isError ? (
            <p className="text-sm text-destructive">{t("vgl5.pub.error")}</p>
          ) : other.data?.state === "OK" ? (
            <CompareTable a={self} b={other.data.profile} />
          ) : (
            <p className="text-sm text-muted-foreground" data-public-compare-missing>
              {t(
                other.data?.state === "INVALID_ID"
                  ? "vgl5.pub.invalid.description"
                  : "vgl5.pub.compare.notFound",
              )}
            </p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

export function PublicProfilePage({ publicId, vs }: { publicId: string; vs?: string | undefined }) {
  const { t } = useI18n();
  const q = usePublicProfile(publicId);
  let body: ReactNode;
  if (q.isPending)
    body = <p className="text-center text-sm text-muted-foreground">{t("vgl5.pub.loading")}</p>;
  else if (q.isError)
    body = <StateCard title={t("vgl5.pub.notFound.title")} description={t("vgl5.pub.error")} />;
  else if (q.data.state === "INVALID_ID")
    body = (
      <StateCard
        title={t("vgl5.pub.invalid.title")}
        description={t("vgl5.pub.invalid.description")}
      />
    );
  else if (q.data.state === "NOT_FOUND")
    body = (
      <StateCard
        title={t("vgl5.pub.notFound.title")}
        description={t("vgl5.pub.notFound.description")}
      />
    );
  else if (q.data.state === "OK") {
    const p = q.data.profile;
    body = (
      <div className="space-y-6" data-public-profile>
        <Identity p={p} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ScorePanel p={p} />
          <BestMapPanel p={p} />
          <DnaPanel p={p} />
          <StatsPanel p={p} />
          <RecentPanel p={p} />
          <ComparePanel self={p} vs={vs} />
        </div>
        <p className="text-xs text-muted-foreground">{t("vgl5.pub.footer")}</p>
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" aria-label="CS2 PRO">
            <Brand />
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/register">{t("vgl5.pub.cta")}</Link>
          </Button>
        </div>
        {body}
      </div>
    </div>
  );
}
