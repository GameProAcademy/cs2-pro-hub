import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { RealUtilityPage, type UtilitySearch } from "@/components/real/RealUtility";
import { utilityInput } from "@/lib/utility.functions";

/**
 * PM3 / 4.2.6 — utility (module D). The selected match lives in the URL (deep-linkable); it is
 * re-validated here and again on the server (`getMatchUtility`).
 */
export const Route = createFileRoute("/_authenticated/utility")({
  validateSearch: (search: Record<string, unknown>): UtilitySearch => {
    const parsed = utilityInput.shape.matchId.safeParse(search["matchId"]);
    return parsed.success && parsed.data ? { matchId: parsed.data } : {};
  },
  // UX-1.5: a link to one match opens that match's room on the equivalent tab (old deep links
  // keep working); without a match this page still works on its own.
  beforeLoad: ({ search }) => {
    if (search.matchId)
      throw redirect({
        to: "/matches/$matchId",
        params: { matchId: search.matchId },
        search: { tab: "utility", ...{} },
        replace: true,
      });
  },
  head: () => ({ meta: [{ title: "Utilitários — CS2 PRO AI COACH" }] }),
  component: UtilityPage,
});

function UtilityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/utility" });
  return (
    <RealUtilityPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
