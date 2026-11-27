/**
 * VGL 3.0 — Tactical Briefing family.
 *
 * - `BriefingRail`: the X-ray's three layers (observed → inference → recommendation) as a rail at
 *   the top, with the real count of items of each layer and a jump to it. No text changes.
 * - `CoachMapContext`: under a Coach reply, the maps the reply names that also exist in the
 *   player's own matches, with the count of those matches and a link to the map. It does not read
 *   intent, pick a match or add a conclusion: it only lists what the text names and the list holds.
 */
import { Link } from "@tanstack/react-router";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { MapEmblem } from "@/components/cs2/Cs2Art";
import { usePlayerOverview } from "@/components/real/RealData";
import { useT } from "@/i18n";
import { coachTokens } from "@/lib/coach/coachSections";
import { mapDisplayName } from "@/lib/cs2/maps";
import { fill } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BriefingStep {
  id: string;
  title: string;
  icon: GameIconName;
  /** Items in the layer; null when the layer has no countable list. */
  count: number | null;
}

export function BriefingRail({ steps }: { steps: BriefingStep[] }) {
  const t = useT();
  return (
    <nav
      aria-label={t("vgl3.briefing.label")}
      className="surface-panel vgl-grid relative overflow-hidden rounded-xl border border-border p-3 sm:p-4"
      data-briefing-rail
    >
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.id} className="relative">
            <a
              href={`#${s.id}`}
              className="vgl-lift flex min-h-11 items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-briefing-step={i + 1}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <GameIcon name={s.icon} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block truncate text-sm font-semibold text-foreground">
                  {s.title}
                </span>
              </span>
              {s.count !== null ? (
                <span
                  className={cn(
                    "font-mono text-lg font-semibold tabular-nums",
                    s.count ? "text-foreground" : "text-muted-foreground",
                  )}
                  data-briefing-count={s.count}
                >
                  {s.count}
                </span>
              ) : null}
            </a>
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-primary sm:block"
              >
                ›
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Maps named in the text, in order of first mention, without repeats. Pure. */
export function citedMaps(text: string): string[] {
  const out: string[] = [];
  for (const tok of coachTokens(text))
    if (tok.kind === "map" && !out.includes(tok.map)) out.push(tok.map);
  return out;
}

export function CoachMapContext({ content }: { content: string }) {
  const t = useT();
  const q = usePlayerOverview();
  const maps = citedMaps(content);
  if (!maps.length || !q.data || q.data.state !== "READY") return null;
  const rows = maps
    .map((map) => ({ map, n: q.data!.matches.filter((m) => m.map === map).length }))
    .filter((r) => r.n > 0);
  if (!rows.length) return null;
  return (
    <aside
      className="mt-3 border-t border-border/70 pt-3"
      aria-label={t("vgl3.coach.maps")}
      data-coach-map-context
    >
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {t("vgl3.coach.maps")}
      </p>
      <ul className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.map} data-coach-map-link={r.map}>
            <Link
              to="/maps"
              search={{ map: r.map }}
              className="vgl-lift inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MapEmblem map={r.map} className="size-6" />
              <span className="font-medium text-foreground">{mapDisplayName(r.map)}</span>
              <span className="text-xs text-muted-foreground">
                {fill(t("vgl3.coach.mapMatches"), { n: r.n })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
