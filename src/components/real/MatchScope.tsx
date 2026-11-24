import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { AppShell } from "@/components/layout/AppShell";

/**
 * UX-1.5 — the per-match pages (Rounds, Duels, Deaths, Utility, Map, Replay) are also the tabs
 * of the Match Room (`/matches/$matchId`). Inside the room they render without their own shell,
 * page header and match selector: the room owns the match, the page owns its calculation (the
 * same component, the same server function — nothing duplicated).
 */
const EmbeddedContext = createContext(false);

export function EmbeddedScope({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value>{children}</EmbeddedContext.Provider>;
}

export const useEmbedded = () => useContext(EmbeddedContext);

/** AppShell on the standalone route; a plain block inside the Match Room. */
export function MaybeShell({ children }: { children: ReactNode }) {
  return useEmbedded() ? <>{children}</> : <AppShell>{children}</AppShell>;
}

/** The page header only on the standalone route (the room shows its own context header). */
export function MaybePageHeader(props: ComponentProps<typeof PageHeader>) {
  return useEmbedded() ? null : <PageHeader {...props} />;
}

/** The match selector only on the standalone route. */
export function MatchSelectSlot({ children }: { children: ReactNode }) {
  return useEmbedded() ? null : <>{children}</>;
}
