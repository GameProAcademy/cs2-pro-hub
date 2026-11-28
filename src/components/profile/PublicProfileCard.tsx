/**
 * VGL 5.0 — owner control for the public profile: private by default, one switch, the shareable
 * link, and an explicit list of what becomes visible (and what never does).
 */
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";
import {
  getMyPublicProfileSettings,
  setMyPublicProfile,
  type PublicProfileSettings,
} from "@/lib/publicProfile.functions";

export const PUBLIC_PROFILE_SETTINGS_KEY = ["public-profile-settings"] as const;

export function PublicProfileCard() {
  const t = useT();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: PUBLIC_PROFILE_SETTINGS_KEY,
    queryFn: () => getMyPublicProfileSettings(),
  });
  const m = useMutation({
    mutationFn: (isPublic: boolean) => setMyPublicProfile({ data: { isPublic } }),
    onSuccess: (next: PublicProfileSettings) => {
      qc.setQueryData(PUBLIC_PROFILE_SETTINGS_KEY, next);
      if (next.publicId) void qc.invalidateQueries({ queryKey: ["public-profile", next.publicId] });
    },
  });
  const s = q.data;
  const isPublic = m.isPending ? m.variables === true : s?.isPublic === true;
  const url =
    s?.publicId && typeof window !== "undefined"
      ? `${window.location.origin}/p/${s.publicId}`
      : null;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the link stays visible to copy by hand */
    }
  };
  return (
    <ChartCard
      title={t("vgl5.pub.settings.title")}
      subtitle={t("vgl5.pub.settings.description")}
      showDemoTag={false}
    >
      {s && !s.hasPlayer ? (
        <p className="text-sm text-muted-foreground">{t("vgl5.pub.settings.noPlayer")}</p>
      ) : (
        <div className="space-y-4" data-public-settings data-public-state={isPublic ? "on" : "off"}>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t("vgl5.pub.settings.toggle")}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {isPublic ? t("vgl5.pub.settings.on") : t("vgl5.pub.settings.off")}
              </span>
              <Switch
                checked={isPublic}
                disabled={!s || m.isPending}
                onCheckedChange={(v) => m.mutate(v)}
                aria-label={t("vgl5.pub.settings.toggle")}
              />
            </span>
          </label>
          {m.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("vgl5.pub.settings.error")}
            </p>
          ) : null}
          {s?.publicId ? (
            <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">
                {t("vgl5.pub.id")}: <span className="font-mono text-foreground">{s.publicId}</span>
              </p>
              {isPublic ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copy} type="button">
                    {copied ? t("vgl5.pub.settings.copied") : t("vgl5.pub.settings.copy")}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/p/$publicId" params={{ publicId: s.publicId }}>
                      {t("vgl5.pub.settings.open")}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}
