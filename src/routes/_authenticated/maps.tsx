import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RealHeatmapPage, type HeatmapSearch } from "@/components/real/RealHeatmap";
import { spatialHeatmapInput } from "@/lib/spatial.functions";

/**
 * PM1 / 4.2.2 — spatial heatmaps. Filters live in the URL so the context survives navigation;
 * each one is re-validated here and again on the server (`getSpatialHeatmap`).
 */
export const Route = createFileRoute("/_authenticated/maps")({
  validateSearch: (search: Record<string, unknown>): HeatmapSearch => {
    const shape = spatialHeatmapInput.shape;
    const out: Record<string, unknown> = {};
    for (const key of ["map", "layer", "side", "level", "matchId", "weapon"] as const) {
      if (search[key] === undefined) continue;
      const parsed = shape[key].safeParse(search[key]);
      if (parsed.success) out[key] = parsed.data;
    }
    return out as HeatmapSearch;
  },
  head: () => ({ meta: [{ title: "Mapas — CS2 PRO AI COACH" }] }),
  component: MapsPage,
});

function MapsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/maps" });
  return (
    <RealHeatmapPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
