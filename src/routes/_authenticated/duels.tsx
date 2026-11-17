import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RealCombatPage, type CombatSearch } from "@/components/real/RealCombat";
import { combatInput } from "@/lib/combat.functions";

/**
 * PM3 / 4.2.5 — duels & aim (module C). The selected match lives in the URL (deep-linkable); it
 * is re-validated here and again on the server (`getMatchCombat`).
 */
export const Route = createFileRoute("/_authenticated/duels")({
  validateSearch: (search: Record<string, unknown>): CombatSearch => {
    const parsed = combatInput.shape.matchId.safeParse(search["matchId"]);
    return parsed.success && parsed.data ? { matchId: parsed.data } : {};
  },
  head: () => ({ meta: [{ title: "Confrontos — CS2 PRO AI COACH" }] }),
  component: DuelsPage,
});

function DuelsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/duels" });
  return (
    <RealCombatPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
