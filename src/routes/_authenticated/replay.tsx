import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { RealReplayPage, type ReplaySearch } from "@/components/real/RealReplay";

const search = z.object({
  matchId: z.string().uuid().optional(),
  round: z.coerce.number().int().min(0).max(256).optional(),
  tick: z.coerce.number().int().min(0).optional(),
});

/**
 * PM2 / 4.2.4 — 2D replay. Match, round and tick live in the URL (deep links from the death
 * review); each is re-validated here and again on the server (`getReplaySegment`).
 */
export const Route = createFileRoute("/_authenticated/replay")({
  validateSearch: (raw: Record<string, unknown>): ReplaySearch => {
    const out: ReplaySearch = {};
    for (const key of ["matchId", "round", "tick"] as const) {
      const parsed = search.shape[key].safeParse(raw[key]);
      if (parsed.success && parsed.data !== undefined)
        (out as Record<string, unknown>)[key] = parsed.data;
    }
    return out;
  },
  // UX-1.5: a link to one match opens that match's room on the equivalent tab (old deep links
  // keep working); without a match this page still works on its own.
  beforeLoad: ({ search }) => {
    if (search.matchId)
      throw redirect({
        to: "/matches/$matchId",
        params: { matchId: search.matchId },
        search: {
          tab: "replay",
          ...{
            ...(search.round !== undefined ? { round: search.round } : {}),
            ...(search.tick !== undefined ? { tick: search.tick } : {}),
          },
        },
        replace: true,
      });
  },
  head: () => ({ meta: [{ title: "Replay 2D — CS2 PRO AI COACH" }] }),
  component: ReplayPage,
});

function ReplayPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/replay" });
  return (
    <RealReplayPage
      search={s}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
