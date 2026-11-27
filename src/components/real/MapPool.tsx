/**
 * Visual Game Language: the player's map pool — the maps of the matches already listed for them,
 * with how many matches each has. A plain count of existing rows: no rate, no score, no ranking.
 * Matches without an identified map are reported apart and never assigned to a map.
 */
import { Link } from "@tanstack/react-router";

import { ChartCard } from "@/components/common/ChartCard";
import { MapTile } from "@/components/common/GameVisuals";
import { useT } from "@/i18n";
import { fill } from "@/lib/format";

export interface MapPoolEntry {
  map: string;
  matches: number;
}

export function mapPool(rows: ReadonlyArray<{ map: string | null }>): {
  entries: MapPoolEntry[];
  unknown: number;
} {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const r of rows) {
    if (!r.map) {
      unknown += 1;
      continue;
    }
    counts.set(r.map, (counts.get(r.map) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .map(([map, matches]) => ({ map, matches }))
    .sort((a, b) => b.matches - a.matches || a.map.localeCompare(b.map));
  return { entries, unknown };
}

export function MapPoolCard({ rows }: { rows: ReadonlyArray<{ map: string | null }> }) {
  const t = useT();
  const { entries, unknown } = mapPool(rows);
  if (entries.length === 0) return null;
  return (
    <ChartCard
      showDemoTag={false}
      icon="map"
      title={t("vgl.mapPool.title")}
      subtitle={t("vgl.mapPool.subtitle")}
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-map-pool>
        {entries.map((e) => (
          <li key={e.map}>
            <Link
              to="/maps"
              className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-elevated/40 px-3 py-2 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              data-map-pool-entry={e.map}
            >
              <MapTile map={e.map} size="md" showName />
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {fill(t("vgl.mapPool.matches"), { n: e.matches })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {unknown > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground" data-map-pool-unknown={unknown}>
          {fill(t("vgl.mapPool.unknown"), { n: unknown })}
        </p>
      ) : null}
    </ChartCard>
  );
}
