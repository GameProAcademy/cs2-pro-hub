/**
 * External player identities — READ ONLY.
 *
 * The server owns identity_status, confidence and verification. The UI never
 * offers a control that could promote an identity.
 */
import { Link } from "@tanstack/react-router";
import { Fingerprint, Lock } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { PlayerConnectionRow, PlayerIdentityRow } from "@/lib/profile.functions";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<string, string> = {
  verified: "border-success/30 bg-success/10 text-success",
  strongly_correlated: "border-primary/30 bg-primary/10 text-primary",
  correlated: "border-warning/30 bg-warning/10 text-warning",
  conflict: "border-destructive/30 bg-destructive/10 text-destructive",
  unlinked: "border-border bg-secondary text-muted-foreground",
};

const PLATFORM_SOURCE: Record<string, string> = {
  FACEIT: "faceit",
  GAMERS_CLUB: "gamers_club",
  STEAM: "steam",
};

export function IdentitiesCard({
  identities,
  connections,
}: {
  identities: PlayerIdentityRow[];
  connections: PlayerConnectionRow[];
}) {
  const t = useT();

  const rows = ["FACEIT", "GAMERS_CLUB", "STEAM"].map((platform) => {
    const identity = identities.find((item) => item.platform === platform) ?? null;
    const connection =
      connections.find((item) => item.source === PLATFORM_SOURCE[platform]) ?? null;
    return { platform, identity, connection };
  });

  return (
    <ChartCard
      title={t("profile.section.identities")}
      subtitle={t("profile.section.identitiesDesc")}
      showDemoTag={false}
    >
      <ul className="space-y-2">
        {rows.map(({ platform, identity, connection }) => {
          const status = identity?.identity_status ?? "unlinked";
          const blocked = platform === "GAMERS_CLUB";
          return (
            <li
              key={platform}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Fingerprint className="size-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t(`identity.source.${PLATFORM_SOURCE[platform]}` as TranslationKey)}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {identity?.username ??
                      connection?.external_username ??
                      identity?.external_id ??
                      t("identity.notConnected")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {blocked ? (
                  <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-warning">
                    {t("profile.identities.blocked")}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                    STATUS_CLASS[status] ?? STATUS_CLASS["unlinked"],
                  )}
                >
                  {t(`identity.status.${status}` as TranslationKey)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        {t("profile.identities.readOnly")}
      </p>
      <Link to="/upload" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
        {t("profile.identities.connect")}
      </Link>
    </ChartCard>
  );
}
