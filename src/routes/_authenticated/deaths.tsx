import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RealDeathReviewPage, type DeathReviewSearch } from "@/components/real/RealDeathReview";
import { deathReviewInput } from "@/lib/diagnosis.functions";

/**
 * PM2 / 4.2.3 — death review. The selected match lives in the URL (deep-linkable); it is
 * re-validated here and again on the server (`getMatchDeathReview`).
 */
export const Route = createFileRoute("/_authenticated/deaths")({
  validateSearch: (search: Record<string, unknown>): DeathReviewSearch => {
    const parsed = deathReviewInput.shape.matchId.safeParse(search["matchId"]);
    return parsed.success && parsed.data ? { matchId: parsed.data } : {};
  },
  head: () => ({ meta: [{ title: "Mortes — CS2 PRO AI COACH" }] }),
  component: DeathsPage,
});

function DeathsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/deaths" });
  return (
    <RealDeathReviewPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
