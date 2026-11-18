import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RealEvolutionPage, type EvolutionSearch } from "@/components/real/RealEvolution";
import { evolutionInput } from "@/lib/evolution.functions";

/**
 * PM4 / 4.2.8 — evolution and consistency (module G). Window, map and side live in the URL;
 * they are re-validated here and again on the server (`getEvolution`).
 */
export const Route = createFileRoute("/_authenticated/evolution")({
  validateSearch: (search: Record<string, unknown>): EvolutionSearch => {
    const out: EvolutionSearch = {};
    const w = evolutionInput.shape.window.safeParse(Number(search["window"]));
    if (w.success && w.data) out.window = w.data;
    const m = evolutionInput.shape.map.safeParse(search["map"]);
    if (m.success && m.data) out.map = m.data;
    const s = evolutionInput.shape.side.safeParse(search["side"]);
    if (s.success && s.data && s.data !== "ALL") out.side = s.data;
    return out;
  },
  head: () => ({ meta: [{ title: "Evolução — CS2 PRO AI COACH" }] }),
  component: EvolutionPage,
});

function EvolutionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/evolution" });
  return (
    <RealEvolutionPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
