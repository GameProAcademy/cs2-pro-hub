import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { RealRoundsPage, type RoundsSearch } from "@/components/real/RealRounds";
import { roundsInput } from "@/lib/rounds.functions";

/**
 * PM4 / 4.2.7 — rounds and economy (modules E/F). The selected match lives in the URL (deep-linkable); it is
 * re-validated here and again on the server (`getMatchRounds`).
 */
export const Route = createFileRoute("/_authenticated/rounds")({
  validateSearch: (search: Record<string, unknown>): RoundsSearch => {
    const parsed = roundsInput.shape.matchId.safeParse(search["matchId"]);
    return parsed.success && parsed.data ? { matchId: parsed.data } : {};
  },
  // UX-1.5: a link to one match opens that match's room on the equivalent tab (old deep links
  // keep working); without a match this page still works on its own.
  beforeLoad: ({ search }) => {
    if (search.matchId)
      throw redirect({
        to: "/matches/$matchId",
        params: { matchId: search.matchId },
        search: { tab: "rounds", ...{} },
        replace: true,
      });
  },
  head: () => ({ meta: [{ title: "Rounds — CS2 PRO AI COACH" }] }),
  component: RoundsPage,
});

function RoundsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/rounds" });
  return (
    <RealRoundsPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
