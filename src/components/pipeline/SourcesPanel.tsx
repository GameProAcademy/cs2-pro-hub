/**
 * Honest data-source surface.
 *
 * Availability is source-specific: the demo ingestion pipeline is functional, and
 * FACEIT has its own official OAuth/API integration. Other entries are rendered
 * according to registry metadata; this panel does not implement or invoke provider
 * integrations itself.
 *
 * The "public profile" source and its link-format field are no longer shown here (owner
 * decision 2026-11-26): FACEIT ownership is now proven by the official OAuth/API integration.
 * Presentation only: the `public_profile` source id, registry, capabilities and
 * `parsePublicProfileUrl` are unchanged.
 */
import { Lock } from "lucide-react";

import { ToneBadge } from "@/components/common/VisualBadges";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { describeSource } from "@/lib/sources/registry";
import { DATA_SOURCES, type DataSource } from "@/lib/sources/sources";

const sourceKey = (source: DataSource) => `sources.source.${source}` as TranslationKey;

/** Sources listed on /upload: every registered source except the hidden public profile. */
export const DISPLAYED_SOURCES = DATA_SOURCES.filter((source) => source !== "public_profile");

export function SourcesPanel() {
  const t = useT();

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {DISPLAYED_SOURCES.map((source) => {
          const descriptor = describeSource(source);
          return (
            <li
              key={source}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {t(sourceKey(source))}
                </p>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  {t(`sources.quality.${descriptor.quality}` as TranslationKey)}
                </p>
              </div>
              <ToneBadge
                tone={descriptor.implemented ? "context" : "neutral"}
                className="shrink-0 font-mono uppercase tracking-wider"
                data-source-state={descriptor.implemented ? "active" : "prepared"}
              >
                {descriptor.implemented ? t("sources.state.active") : t("sources.state.prepared")}
              </ToneBadge>
            </li>
          );
        })}
      </ul>

      <p className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        {t("sources.notAvailable")}
      </p>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("sources.privacy")}</p>
    </div>
  );
}
