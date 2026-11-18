import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RealMomentsPage, type MomentsSearch } from "@/components/moments/RealMoments";
import { listMomentsInput } from "@/lib/moments.functions";

/** PM5 / 4.2.10 — personal moments library (module I). Filters live in the URL. */
export const Route = createFileRoute("/_authenticated/moments")({
  validateSearch: (raw: Record<string, unknown>): MomentsSearch => {
    const out: MomentsSearch = {};
    for (const key of ["collectionId", "kind", "tag", "map", "q"] as const) {
      const parsed = listMomentsInput.shape[key].safeParse(raw[key]);
      if (parsed.success && parsed.data !== undefined)
        (out as Record<string, unknown>)[key] = parsed.data;
    }
    return out;
  },
  head: () => ({ meta: [{ title: "Momentos — CS2 PRO AI COACH" }] }),
  component: MomentsPage,
});

function MomentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/moments" });
  return (
    <RealMomentsPage
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
