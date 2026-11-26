/**
 * /upload — "how it works" side panel (visual evolution E2, desktop ≥1280 px only).
 *
 * Context, not data: three numbered steps of the real loop (send the demo → processing and
 * identification → diagnosis and training) with links to the screens that use an analysed match.
 * It reads nothing, renders no example or invented value and never touches the upload flow.
 * Same numbered-step pattern as the X-ray layers (VISUAL_SYSTEM.md).
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { GameIcon, type GameIconName } from "@/components/common/GameIcon";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";

const STEPS: { id: "send" | "process" | "use"; icon: GameIconName }[] = [
  { id: "send", icon: "rounds" },
  { id: "process", icon: "crosshair" },
  { id: "use", icon: "target" },
];

const DESTINATIONS = [
  { to: "/analysis", label: "nav.analysis" },
  { to: "/player-dna", label: "nav.playerDna" },
  { to: "/training", label: "nav.training" },
] as const;

export function UploadLoop() {
  const t = useT();
  return (
    <section
      data-upload-loop
      aria-labelledby="upload-loop-title"
      className="rounded-xl border border-border bg-card/60 p-5"
    >
      <h2
        id="upload-loop-title"
        className="font-display text-sm font-semibold uppercase tracking-wide text-foreground"
      >
        {t("analyze.loop.title")}
      </h2>
      <ol className="mt-4 space-y-5">
        {STEPS.map((step, index) => (
          <li key={step.id} data-loop-step={step.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
            >
              <GameIcon name={step.icon} className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="text-sm font-semibold text-foreground">
                {t(`analyze.loop.${step.id}.title` as TranslationKey)}
              </h3>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {t(`analyze.loop.${step.id}.body` as TranslationKey)}
              </p>
              {step.id === "use" ? (
                <ul className="mt-2 space-y-1" aria-label={t("analyze.loop.linksLabel")}>
                  {DESTINATIONS.map((d) => (
                    <li key={d.to}>
                      <Link
                        to={d.to}
                        className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        {t(d.label)}
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
