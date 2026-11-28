/**
 * VGL 2.0 continuation — competitive identity hero on the profile. Shows only what the player
 * saved (name, nickname, team, level, platform, roles) and plain counts of the analysed matches
 * already listed for them. The "most played map" appears only when one map strictly leads the
 * count; a tie names no map. No e-mail, no SteamID, no score, no rank.
 */
import { Link } from "@tanstack/react-router";

import { GameIcon } from "@/components/common/GameIcon";
import { UserAvatar } from "@/components/common/UserAvatar";
import { MapArt, MapEmblem } from "@/components/cs2/Cs2Art";
import { mapPool } from "@/components/real/MapPool";
import { useT } from "@/i18n";
import { mapDisplayName } from "@/lib/cs2/maps";
import { fill } from "@/lib/format";

export function leadingMap(
  rows: ReadonlyArray<{ map: string | null }>,
): { map: string; matches: number } | null {
  const { entries } = mapPool(rows);
  const [first, second] = entries;
  if (!first) return null;
  if (second && second.matches === first.matches) return null;
  return first;
}

export function ProfileHero({
  avatarSource,
  displayName,
  nickname,
  team,
  level,
  platform,
  roles,
  matches,
}: {
  avatarSource: string | null;
  displayName: string | null;
  nickname: string | null;
  team: string | null;
  level: string | null;
  platform: string | null;
  roles: string[];
  matches: ReadonlyArray<{ map: string | null }> | null;
}) {
  const t = useT();
  const lead = matches ? leadingMap(matches) : null;
  const name = displayName || nickname;
  return (
    <MapArt map={lead?.map ?? null} className="vgl-rise rounded-xl border border-border">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7" data-profile-hero>
        <span className="vgl-ring relative shrink-0 self-start rounded-full border-2 border-primary/60 p-1">
          <UserAvatar source={avatarSource} name={name} size={88} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {t("vgl.profile.hero.eyebrow")}
          </p>
          <h2 className="mt-1 break-words font-display text-2xl font-semibold text-foreground sm:text-3xl" data-profile-nickname>
            {nickname || displayName || t("vgl.profile.hero.noName")}
          </h2>
          {nickname && displayName && nickname !== displayName ? (
            <p className="font-mono text-sm text-muted-foreground" data-profile-display-name>{displayName}</p>
          ) : null}
          <ul className="mt-3 flex flex-wrap gap-2 text-xs" data-profile-hero-tags>
            {team ? (
              <li className="rounded-full border border-border-strong bg-background/60 px-2.5 py-1">
                {team}
              </li>
            ) : null}
            {level ? (
              <li className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
                {level}
              </li>
            ) : null}
            {platform ? (
              <li className="rounded-full border border-border-strong bg-background/60 px-2.5 py-1">
                {platform}
              </li>
            ) : null}
            {roles.map((r) => (
              <li
                key={r}
                className="rounded-full border border-context/40 bg-context/10 px-2.5 py-1 text-context"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          {matches ? (
            <p className="text-sm text-muted-foreground" data-profile-hero-matches>
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {matches.length}
              </span>{" "}
              {t("vgl.profile.hero.matches")}
            </p>
          ) : null}
          {lead ? (
            <p className="flex items-center gap-2 text-sm" data-profile-hero-map={lead.map}>
              <MapEmblem map={lead.map} className="size-7" />
              <span>
                <span className="block text-xs text-muted-foreground">
                  {t("vgl.profile.hero.topMap")}
                </span>
                <span className="font-medium text-foreground">
                  {mapDisplayName(lead.map)} ·{" "}
                  {fill(t("vgl.profile.hero.mapMatches"), { n: lead.matches })}
                </span>
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link
              to="/player-dna"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GameIcon name="dna" className="size-4" />
              {t("vgl.profile.hero.dna")}
            </Link>
            <Link
              to="/matches"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-background/60 px-3 text-sm font-medium text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GameIcon name="map" className="size-4" />
              {t("vgl.profile.hero.matchesLink")}
            </Link>
          </div>
        </div>
      </div>
    </MapArt>
  );
}
