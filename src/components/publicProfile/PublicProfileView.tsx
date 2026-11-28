/**
 * VGL 5.0 — public player profile page and side-by-side comparison. Renders only the
 * whitelisted `PublicProfile` view; a private or unknown id is one and the same state.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";

import { DnaRadarA, type RadarAxis } from "@/components/charts/DnaRadarA";
import { GameIcon } from "@/components/common/GameIcon";
import { Cs2Mask, MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { DIMENSION_ART } from "@/lib/cs2/assets";
import {
  countryName,
  isPlatformCode,
  isTeamRoleCode,
  platformLabelKey,
  roleLabelKey,
} from "@/lib/profile/taxonomy";
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
  icon,
  children,
  className,
  ...rest
}: {
  title: string;
  icon?: Parameters<typeof GameIcon>[0]["name"];
  children: ReactNode;
  className?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <section
      className={cn(
        "surface-panel vgl-grid relative isolate overflow-hidden rounded-xl border border-border p-4 sm:p-5",
        className,
      )}
      aria-label={title}
      {...rest}
    >
      <h2 className="mb-4 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {icon ? (
          <span className="flex size-6 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <GameIcon name={icon} className="size-3.5" />
          </span>
        ) : null}
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
      className="surface-panel vgl-grid mx-auto max-w-lg rounded-xl border border-border p-6 text-center"
      data-public-state
    >
      <h1 className="font-display text-2xl font-semibold uppercase">{title}</h1>
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

/** Regional-indicator flag for an ISO 3166-1 alpha-2 code (decorative; the name is also shown). */
export function flagEmoji(code: string | null): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

function Tag({
  children,
  tone = "muted",
  ...rest
}: { children: ReactNode; tone?: "brand" | "muted" } & Record<`data-${string}`, unknown>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        tone === "brand"
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border bg-background/60 text-muted-foreground",
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

function topDimension(p: PublicProfile) {
  if (p.dna.state !== "READY") return null;
  const top = [...p.dna.dimensions]
    .filter((d): d is { dimension: string; value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value)[0];
  return top && top.value >= 65 ? top : null;
}

/** VGL 5.1 (Frente 3): the player's identity over the art of their best map. */
function Hero({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  const name = p.identity.nickname ?? p.identity.publicId;
  const top = topDimension(p);
  const country = p.identity.country;
  const flag = flagEmoji(country);
  const platform = p.identity.platform;
  const role = p.identity.role;
  return (
    <header
      className="relative isolate overflow-hidden rounded-2xl border border-border"
      data-public-identity
    >
      <MapArt map={p.maps.best?.map ?? null} className="px-5 py-6 sm:px-8 sm:py-9">
        {top && DIMENSION_ART[top.dimension] ? (
          <Cs2Mask
            src={DIMENSION_ART[top.dimension]!}
            className="pointer-events-none absolute -right-6 bottom-0 -z-10 h-44 w-80 text-primary opacity-[0.07]"
          />
        ) : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative size-24 shrink-0 sm:size-28">
              <div className="size-full overflow-hidden rounded-2xl border-2 border-primary/60 bg-elevated shadow-[0_0_32px_-8px_var(--primary)]">
                <img
                  src={p.identity.avatarUrl ?? "/gamepro-symbol.png"}
                  alt=""
                  className={cn(
                    "size-full",
                    p.identity.avatarUrl ? "object-cover" : "object-contain p-4 opacity-80",
                  )}
                  data-public-avatar={p.identity.avatarUrl ? "photo" : "default"}
                />
              </div>
              {flag ? (
                <span
                  aria-hidden
                  className="absolute -bottom-2 -right-2 rounded-md border border-border bg-background px-1 text-lg leading-6"
                >
                  {flag}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">
                {t("vgl51.pub.eyebrow")}
              </p>
              <h1 className="mt-1 break-words font-display text-4xl font-semibold uppercase leading-none tracking-wide sm:text-5xl">
                {name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-1.5" data-public-tags>
                {country ? (
                  <Tag data-public-country={country}>
                    {flag ? <span aria-hidden>{flag}</span> : null}
                    {countryName(country, intlTag)}
                  </Tag>
                ) : null}
                {platform ? (
                  <Tag tone="brand" data-public-platform={platform}>
                    <GameIcon name="crosshair" className="size-3" />
                    {isPlatformCode(platform) ? t(platformLabelKey(platform)) : platform}
                  </Tag>
                ) : null}
                {role ? <Tag>{isTeamRoleCode(role) ? t(roleLabelKey(role)) : role}</Tag> : null}
                {p.identity.team ? (
                  <Tag>{fill(t("vgl51.pub.team"), { team: p.identity.team })}</Tag>
                ) : null}
                {top ? (
                  <Tag tone="brand" data-public-specialty={top.dimension}>
                    <GameIcon name="dna" className="size-3" />
                    {fill(t("vgl51.pub.specialty"), {
                      dimension: t(dnaLabelKey(top.dimension as DnaDimension)),
                    })}
                  </Tag>
                ) : null}
                <Tag data-public-id>
                  <span className="font-mono">
                    {t("vgl5.pub.id")}: {p.identity.publicId}
                  </span>
                </Tag>
              </div>
            </div>
          </div>
          <ScoreBlock p={p} />
        </div>
      </MapArt>
    </header>
  );
}

function ScoreBlock({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  const v = p.score.value;
  const filled = v === null ? 0 : Math.round((v / 100) * 20);
  return (
    <div
      className="w-full shrink-0 rounded-xl border border-primary/30 bg-background/70 p-4 backdrop-blur-sm lg:w-80"
      data-public-score-block
    >
      <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-primary">
        <GameIcon name="target" className="size-3.5" />
        {t("vgl5.pub.score")}
      </p>
      {v !== null ? (
        <p className="mt-2 flex items-baseline gap-2" data-public-score>
          <span className="font-display text-6xl font-semibold leading-none tabular-nums drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
            {formatNumber(v, intlTag, 0)}
          </span>
          <span className="font-mono text-muted-foreground">/100</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground" data-public-score-empty>
          {t("vgl5.pub.insufficient")}
        </p>
      )}
      <div aria-hidden className="mt-3 flex h-2 gap-0.5">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-full flex-1 -skew-x-12 rounded-[1px]",
              v === null ? "bg-muted/60" : i < filled ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {fill(t("vgl51.pub.scoreBasis"), {
          n: p.score.matches,
          c: formatNumber(p.score.coverage * 100, intlTag, 0),
        })}
        {p.score.confidence
          ? ` · ${t(`vgl5.score.conf.${p.score.confidence}` as TranslationKey)}`
          : ""}
      </p>
    </div>
  );
}

function StatStrip({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  const cells: Array<[TranslationKey, string, Parameters<typeof GameIcon>[0]["name"]]> = [
    ["real.metric.matches", formatNumber(p.stats.matches, intlTag, 0), "rounds"],
    ["vgl5.pub.metric.rating", formatCompareValue("rating", p.stats.rating, intlTag), "trend"],
    ["vgl5.pub.metric.kd", formatCompareValue("kd", p.stats.kd, intlTag), "kill"],
    ["vgl5.pub.metric.adr", formatCompareValue("adr", p.stats.adr, intlTag), "fire"],
    ["vgl5.pub.metric.kast", formatCompareValue("kast", p.stats.kast, intlTag), "shield"],
    [
      "vgl5.pub.metric.hsPercent",
      formatCompareValue("hsPercent", p.stats.hsPercent, intlTag),
      "headshot",
    ],
    ["vgl5.pub.metric.winRate", formatCompareValue("winRate", p.stats.winRate, intlTag), "target"],
  ];
  return (
    <dl
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7"
      aria-label={t("vgl5.pub.stats")}
      data-public-stats
    >
      {cells.map(([k, v, icon]) => (
        <div
          key={k}
          className="surface-panel relative overflow-hidden rounded-lg border border-border px-3 py-2.5"
        >
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GameIcon name={icon} className="size-3.5 text-primary/80" />
            {t(k)}
          </dt>
          <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DnaPanel({ p }: { p: PublicProfile }) {
  const { t } = useI18n();
  const ready = p.dna.state === "READY" && p.dna.dimensions.some((d) => d.value !== null);
  const axes: RadarAxis[] = p.dna.dimensions.map((d) => ({
    dimension: d.dimension as DnaDimension,
    value: d.value,
    status: d.value === null ? "NO_SAMPLE" : "MEASURED",
  }));
  const top = [...p.dna.dimensions]
    .filter((d): d is { dimension: string; value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  return (
    <Panel title={t("vgl5.pub.dna")} icon="dna" data-public-dna-panel>
      {ready ? (
        <div
          className="grid items-center gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
          data-public-dna
        >
          <DnaRadarA axes={axes} selected={null} />
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {t("vgl51.pub.dnaTop")}
            </p>
            <ol className="space-y-2">
              {top.map((d, i) => (
                <li
                  key={d.dimension}
                  className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold uppercase tracking-wide">
                    {t(dnaLabelKey(d.dimension as DnaDimension))}
                  </span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-primary">
                    {d.value}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
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
    <Panel
      title={t("vgl5.pub.bestMap")}
      icon="map"
      className="p-0 sm:p-0 [&>h2]:px-4 [&>h2]:pt-4 sm:[&>h2]:px-5 sm:[&>h2]:pt-5"
    >
      {best ? (
        <div data-public-best-map>
          <MapArt
            map={best.map}
            overlay="soft"
            className="mx-4 mb-4 rounded-lg border border-border p-4 sm:mx-5"
          >
            <div className="flex items-center gap-3">
              <MapEmblem map={best.map} className="size-14" />
              <div>
                <p className="font-display text-3xl font-semibold uppercase leading-none">
                  {mapDisplayName(best.map)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fill(t("bestMap.matches"), { n: best.matches })} ·{" "}
                  {t(`bestMap.confidence.${best.confidence}` as TranslationKey)}
                </p>
              </div>
            </div>
          </MapArt>
          {p.maps.ranked.length > 1 ? (
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {t("vgl51.pub.mapsRanked")}
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {p.maps.ranked.slice(0, 6).map((m) => (
                  <li
                    key={m.map}
                    className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-2 py-1.5 text-sm"
                  >
                    <MapEmblem map={m.map} className="size-6" />
                    <span className="min-w-0 flex-1 truncate">{mapDisplayName(m.map)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(`bestMap.short.${m.tier}` as TranslationKey)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">
          {t("vgl5.pub.insufficient")}
        </p>
      )}
    </Panel>
  );
}

function RecentPanel({ p }: { p: PublicProfile }) {
  const { t, intlTag } = useI18n();
  return (
    <Panel title={t("vgl5.pub.recent")} icon="rounds">
      {p.recent.length ? (
        <ul className="space-y-2" data-public-recent>
          {p.recent.map((m, i) => (
            <li
              key={`${m.playedAt}-${i}`}
              className={cn(
                "relative flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden rounded-lg border border-border bg-background/50 py-2 pl-4 pr-3 text-sm",
              )}
              data-public-result={m.result ?? "unknown"}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-1",
                  m.result === "win"
                    ? "bg-success"
                    : m.result === "loss"
                      ? "bg-destructive"
                      : "bg-muted",
                )}
              />
              <MapEmblem map={m.map} className="size-7" />
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
    <Panel title={t("vgl5.pub.compare.title")} icon="opening">
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
      <div className="space-y-5 sm:space-y-6" data-public-profile>
        <Hero p={p} />
        <StatStrip p={p} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <DnaPanel p={p} />
          <BestMapPanel p={p} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
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
