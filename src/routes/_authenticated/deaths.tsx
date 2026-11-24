import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { RealDeathReviewPage, type DeathReviewSearch } from "@/components/real/RealDeathReview";
import { deathReviewInput } from "@/lib/diagnosis.functions";

/**
 * PM2 / 4.2.3 — death review. The selected match lives in the URL (deep-linkable); it is
 * re-validated here and again on the server (`getMatchDeathReview`).
 */
export const Route = createFileRoute("/_authenticated/deaths")({
  validateSearch: (search: Record<string, unknown>): DeathReviewSearch => {
    const parsed = deathReviewInput.shape.matchId.safeParse(search["matchId"]);
    if (!parsed.success || !parsed.data) return {};
    const event = z.string().uuid().safeParse(search["event"]);
    return event.success ? { matchId: parsed.data, event: event.data } : { matchId: parsed.data };
  },
  // UX-1.5: a link to one match opens that match's room on the equivalent tab (old deep links
  // keep working); without a match this page still works on its own.
  beforeLoad: ({ search }) => {
    if (search.matchId)
      throw redirect({
        to: "/matches/$matchId",
        params: { matchId: search.matchId },
        search: { tab: "deaths", ...(search.event ? { event: search.event } : {}) },
        replace: true,
      });
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
