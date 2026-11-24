import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  MATCH_ROOM_TABS,
  RealMatchRoomPage,
  type MatchRoomSearch,
} from "@/components/real/RealMatchRoom";
import { spatialHeatmapInput } from "@/lib/spatial.functions";

/**
 * UX-1.5 — Sala da Partida. `/matches/$matchId?tab=…` (Doc. 2 §1 and §3). The id is validated
 * here and again by every server function the tabs call (RLS: the caller's own matches only).
 */
const params = z.object({ matchId: z.string().uuid() });
const searchShape = z.object({
  tab: z.enum(MATCH_ROOM_TABS).optional(),
  round: z.coerce.number().int().min(0).max(256).optional(),
  tick: z.coerce.number().int().min(0).optional(),
  event: z.string().uuid().optional(),
});

export function parseRoomSearch(raw: Record<string, unknown>): MatchRoomSearch {
  const out: Record<string, unknown> = {};
  for (const key of ["tab", "round", "tick", "event"] as const) {
    const parsed = searchShape.shape[key].safeParse(raw[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  const spatial = spatialHeatmapInput.shape;
  for (const key of ["layer", "side", "level", "weapon"] as const) {
    if (raw[key] === undefined) continue;
    const parsed = spatial[key].safeParse(raw[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  if (out["tab"] === "summary") delete out["tab"];
  return out as MatchRoomSearch;
}

export const Route = createFileRoute("/_authenticated/matches_/$matchId")({
  params: {
    parse: (raw) => params.parse(raw),
    stringify: (p) => ({ matchId: p.matchId }),
  },
  validateSearch: parseRoomSearch,
  head: () => ({ meta: [{ title: "Partida — CS2 PRO AI COACH" }] }),
  component: MatchRoomPage,
});

function MatchRoomPage() {
  const { matchId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/matches/$matchId" });
  return (
    <RealMatchRoomPage
      matchId={matchId}
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
    />
  );
}
