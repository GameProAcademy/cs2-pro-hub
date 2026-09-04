/**
 * Gamers Club — connection surface.
 *
 * Honest by construction: the panel validates the public profile URL locally
 * (pure parser, no request) and states clearly that automatic collection is
 * blocked by an external access restriction. It never claims ownership, never
 * shows "profile not found" for a block, and never shows a fake sync button.
 */
import { Info, Lock, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { parseGamersClubProfileUrl } from "@/lib/gamersclub/gamersclub.url";
import { sourceOperationalProfile } from "@/lib/sources/sourceCapabilities";
import { cn } from "@/lib/utils";

export interface GamersClubPanelProps {
  /** Already-registered locator, when the player has one. */
  profileUrl?: string | null;
  externalId?: string | null;
  lastSyncAt?: string | null;
}

export function GamersClubPanel({ profileUrl, externalId, lastSyncAt }: GamersClubPanelProps) {
  const t = useT();
  const [value, setValue] = useState(profileUrl ?? "");
  const parsed = useMemo(
    () => (value.trim() === "" ? null : parseGamersClubProfileUrl(value)),
    [value],
  );
  const operational = sourceOperationalProfile("gamers_club");
  const blocked = operational.externalAccess === "blocked_external_access";

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("gc.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("gc.subtitle")}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
            blocked
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-success/30 bg-success/10 text-success",
          )}
        >
          {blocked ? t("gc.state.blocked") : t("gc.state.connected")}
        </span>
      </header>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("gc.urlLabel")}</span>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://gamersclub.com.br/player/…"
          inputMode="url"
          spellCheck={false}
        />
      </label>

      {parsed !== null && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {parsed.ok ? (
            <>
              <div>
                <dt className="text-muted-foreground">
                  {t(("gc.locator." + parsed.profile.profileLocatorType) as TranslationKey)}
                </dt>
                <dd className="truncate font-mono text-foreground">
                  {parsed.profile.canonicalProfileUrl}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("gc.gcid")}</dt>
                <dd className="font-mono text-foreground">
                  {parsed.profile.externalIdConfirmed && parsed.profile.externalId
                    ? parsed.profile.externalId
                    : (externalId ?? t("gc.gcidUnknown"))}
                </dd>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-destructive">{t("gc.invalidUrl")}</div>
          )}
          <div>
            <dt className="text-muted-foreground">{t("gc.lastSync")}</dt>
            <dd className="font-mono text-foreground">{lastSyncAt ?? t("gc.never")}</dd>
          </div>
        </dl>
      )}

      {blocked && (
        <p className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {t("gc.blockedNotice")}
        </p>
      )}

      <p className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t("gc.ownershipNotice")}
      </p>

      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Lock className="size-3 shrink-0" aria-hidden />
        {operational.architecture}
      </p>
    </section>
  );
}
