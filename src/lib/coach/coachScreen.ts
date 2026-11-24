/**
 * UX-1.8 / R-11: the screen the player has open, sent with a Coach question. Only the area, a
 * match uuid and a Match Room tab leave the browser; the server ignores a match that is not the
 * caller's own and never echoes anything outside its allow-lists.
 */
import { areaOf } from "@/config/navigation";
import type { CoachScreen } from "@/lib/coach/coachContext";
import { COACH_SCREEN_TABS } from "@/lib/coach/coachContext";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function coachScreenFrom(
  pathname: string,
  search: Record<string, unknown>,
): CoachScreen | null {
  const area = areaOf(pathname);
  if (!area) return null;
  const room = /^\/matches\/([0-9a-f-]{36})\/?$/.exec(pathname);
  const fromSearch = typeof search["matchId"] === "string" ? search["matchId"] : null;
  const matchId = room?.[1] ?? fromSearch;
  if (!matchId || !UUID.test(matchId)) return { area: area.id, matchId: null, tab: null };
  const rawTab = room ? (search["tab"] ?? "summary") : null;
  const tab =
    typeof rawTab === "string" && (COACH_SCREEN_TABS as readonly string[]).includes(rawTab)
      ? (rawTab as CoachScreen["tab"])
      : null;
  return { area: area.id, matchId, tab };
}
