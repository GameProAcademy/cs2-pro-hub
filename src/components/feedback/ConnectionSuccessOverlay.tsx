/**
 * Full-screen confirmation shown ONCE when the player comes back from a successful
 * Steam or FACEIT link (the callback redirects with `connection=<provider>_success`).
 *
 * Frosted-glass backdrop, a large animated check, "Connected successfully" in the
 * player's language and the provider's mark; it fades out by itself after a few seconds
 * or on click / Escape. Purely visual: it never decides whether the link worked — the
 * server's redirect does. Honours `prefers-reduced-motion` (no drawing animation).
 */
import { useEffect, useState } from "react";

import { FaceitIcon, SteamIcon } from "@/components/brand/BrandIcons";
import { useT } from "@/i18n";

export const SUCCESS_OVERLAY_MS = 6000;
const FADE_MS = 350;

export function ConnectionSuccessOverlay({ provider }: { provider: "steam" | "faceit" | null }) {
  const t = useT();
  const [phase, setPhase] = useState<"in" | "out" | "gone">(provider ? "in" : "gone");

  useEffect(() => {
    if (!provider) return;
    setPhase("in");
    // Shown once: a reload or "back" must not celebrate again.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("connection")?.endsWith("_success")) {
        url.searchParams.delete("connection");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* ignore */
    }
    const out = window.setTimeout(() => setPhase("out"), SUCCESS_OVERLAY_MS);
    return () => window.clearTimeout(out);
  }, [provider]);

  useEffect(() => {
    if (phase !== "out") return;
    const gone = window.setTimeout(() => setPhase("gone"), FADE_MS);
    return () => window.clearTimeout(gone);
  }, [phase]);

  useEffect(() => {
    if (phase !== "in") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase("out");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  if (!provider || phase === "gone") return null;
  const Mark = provider === "steam" ? SteamIcon : FaceitIcon;

  return (
    <div
      role="status"
      aria-live="polite"
      data-connection-success={provider}
      onClick={() => setPhase("out")}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-md transition-opacity duration-300 data-[phase=out]:opacity-0"
      data-phase={phase}
    >
      <div className="cs-success-card flex flex-col items-center gap-5 rounded-3xl border border-white/15 bg-white/5 px-12 py-10 shadow-2xl backdrop-blur-xl">
        <svg
          viewBox="0 0 120 120"
          className="size-32 text-success drop-shadow-[0_0_24px_currentColor] sm:size-40"
          aria-hidden
        >
          <circle
            className="cs-success-ring"
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            className="cs-success-check"
            d="M38 62 L53 77 L84 45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-center font-display text-2xl font-semibold tracking-wide text-foreground sm:text-3xl">
          {t("link.success.title")}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mark className="size-4" />
          {t(provider === "steam" ? "identity.source.steam" : "identity.source.faceit")}
        </p>
      </div>
    </div>
  );
}
