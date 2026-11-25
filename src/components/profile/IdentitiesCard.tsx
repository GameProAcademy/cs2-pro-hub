/**
 * External player identities — READ ONLY.
 *
 * The server owns identity_status, confidence and verification. The UI never
 * offers a control that could promote an identity. The state of each account comes
 * from `getMyExternalLinks` — the same derivation the FACEIT and Steam cards use — so
 * a disconnected account can never be shown as linked here (or the reverse).
 */
import { Link } from "@tanstack/react-router";
import { Fingerprint, Lock } from "lucide-react";

import { FaceitIcon, SteamIcon } from "@/components/brand/BrandIcons";
import { ChartCard } from "@/components/common/ChartCard";
import { LinkStateBadge } from "@/components/identity/LinkStateBadge";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import type { ExternalPlatform } from "@/lib/identity/externalLinks";
import { useExternalLinks } from "@/lib/identity/useExternalLinks";

const PLATFORM_SOURCE: Record<ExternalPlatform, string> = {
  FACEIT: "faceit",
  GAMERS_CLUB: "gamers_club",
  STEAM: "steam",
};

function PlatformIcon({ platform }: { platform: ExternalPlatform }) {
  if (platform === "STEAM") return <SteamIcon className="size-4 shrink-0 text-primary" />;
  if (platform === "FACEIT") return <FaceitIcon className="size-4 shrink-0 text-primary" />;
  return <Fingerprint className="size-4 shrink-0 text-primary" aria-hidden />;
}

export function IdentitiesCard() {
  const t = useT();
  const links = useExternalLinks();

  return (
    <ChartCard
      title={t("profile.section.identities")}
      subtitle={t("profile.section.identitiesDesc")}
      showDemoTag={false}
    >
      <ul className="space-y-2" data-testid="identities-card">
        {(links.data ?? []).map((link) => (
          <li
            key={link.platform}
            data-platform={link.platform}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <PlatformIcon platform={link.platform} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {t(`identity.source.${PLATFORM_SOURCE[link.platform]}` as TranslationKey)}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {link.username ?? link.idMasked ?? t("identity.notConnected")}
                </p>
                {link.lastSyncAt ? (
                  <p className="text-xs text-muted-foreground">
                    {t("link.lastSync")}: {new Date(link.lastSyncAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {link.platform === "GAMERS_CLUB" ? (
                <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-xs uppercase tracking-wider text-warning">
                  {t("profile.identities.blocked")}
                </span>
              ) : (
                <LinkStateBadge state={link.state} />
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        {t("profile.identities.readOnly")}
      </p>
      <Link
        to="/profile"
        hash="faceit"
        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
      >
        {t("profile.identities.connect")}
      </Link>
    </ChartCard>
  );
}
