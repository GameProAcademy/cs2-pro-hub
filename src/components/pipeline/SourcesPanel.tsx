/**
 * Honest data-source surface.
 *
 * The demo path is the only functional one. The other sources are shown as
 * "architecture prepared" — there is no connect button, because there is no
 * integration behind it. The public-profile field validates a link format only;
 * nothing is fetched, copied or collected.
 */
import { CheckCircle2, Link2, Lock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import { parsePublicProfileUrl, type PublicProfileParseResult } from "@/lib/sources/publicProfile";
import { describeSource } from "@/lib/sources/registry";
import { DATA_SOURCES, type DataSource } from "@/lib/sources/sources";
import { cn } from "@/lib/utils";

const sourceKey = (source: DataSource) => `sources.source.${source}` as TranslationKey;

export function SourcesPanel() {
  const t = useT();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<PublicProfileParseResult | null>(null);

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {DATA_SOURCES.map((source) => {
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
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t(`sources.quality.${descriptor.quality}` as TranslationKey)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                  descriptor.implemented
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {descriptor.implemented ? t("sources.state.active") : t("sources.state.prepared")}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        {t("sources.notAvailable")}
      </p>

      <div className="space-y-2">
        <label
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          htmlFor="public-profile-url"
        >
          {t("sources.publicProfile.label")}
        </label>
        <div className="flex gap-2">
          <Input
            id="public-profile-url"
            value={url}
            inputMode="url"
            placeholder={t("sources.publicProfile.placeholder")}
            onChange={(event) => {
              setUrl(event.target.value);
              setResult(null);
            }}
          />
          <Button variant="outline" onClick={() => setResult(parsePublicProfileUrl(url))}>
            {t("sources.publicProfile.validate")}
          </Button>
        </div>
        {result ? (
          result.ok ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-success">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("sources.publicProfile.valid")}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-destructive">
              {t(`sources.publicProfile.error.${result.error ?? "invalid_url"}` as TranslationKey)}
            </p>
          )
        ) : null}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Link2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("sources.publicProfile.notice")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("sources.privacy")}</p>
      </div>
    </div>
  );
}
