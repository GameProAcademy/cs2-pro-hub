/**
 * VGL 3.0 — Match Timeline family. Kill feed, round marks and round navigation drawn only from the
 * round report the server already returns (`RoundReport`, `TimelineItem`). Nothing is inferred:
 * who acted is "you / teammate / opponent" exactly as the report states, the weapon is the parser's
 * name (ambiguous names get no art) and a missing side stays neutral.
 */
import type { CSSProperties, ReactNode } from "react";

import { GameIcon } from "@/components/common/GameIcon";
import { HudIcon, WeaponArt } from "@/components/cs2/Cs2Art";
import { useT, type TranslationKey } from "@/i18n";
import { weaponArt } from "@/lib/cs2/assets";
import { NOT_AVAILABLE_MARK, fill } from "@/lib/format";
import type { RoundReport, TimelineItem } from "@/lib/rounds/roundImpact";
import { cn } from "@/lib/utils";

type Side = "CT" | "T";
export type FeedWho = "me" | "team" | "enemy" | "unknown";

/** The same rule as the round's text line: you, else unknown side, else team or opponent. */
export function feedWho(side: Side | null, me: boolean, mySide: Side | null): FeedWho {
  if (me) return "me";
  if (!side) return "unknown";
  return side === mySide ? "team" : "enemy";
}

const SIDE_TEXT: Record<Side, string> = { CT: "text-side-ct", T: "text-side-t" };

function Who({ side, who }: { side: Side | null; who: FeedWho }) {
  const t = useT();
  return (
    <span
      className={cn(
        "whitespace-nowrap font-medium",
        side ? SIDE_TEXT[side] : "text-muted-foreground",
        who === "me" && "font-semibold underline decoration-2 underline-offset-4",
      )}
      data-feed-who={who}
      data-feed-side={side ?? "unknown"}
    >
      {t(`rounds.who.${who}` as TranslationKey)}
    </span>
  );
}

/**
 * One kill-feed line, as in the game: actor, weapon, headshot, victim. Your own kill gets the lime
 * frame, your death the critical one. The full sentence stays for screen readers and as the title.
 */
export function KillFeedLine({
  e,
  mySide,
  sentence,
  index = 0,
}: {
  e: TimelineItem;
  mySide: Side | null;
  sentence: string;
  index?: number;
}) {
  const t = useT();
  const frame = e.byMe
    ? "border-primary/70 bg-primary/[0.08]"
    : e.onMe
      ? "border-destructive/70 bg-destructive/[0.08]"
      : "border-border bg-background/70";
  let body: ReactNode;
  if (e.type !== "kill") {
    const icon =
      e.type === "bomb_plant"
        ? "icon_c4_default"
        : e.type === "bomb_defuse"
          ? "icon_defuse_default"
          : "icon_bomb_explosion_default";
    body = (
      <>
        <HudIcon name={icon} className="size-4 text-foreground" />
        <span aria-hidden className="text-foreground">
          {sentence}
        </span>
      </>
    );
  } else if (e.kind === "WORLD" || e.kind === "SELF") {
    body = (
      <>
        <GameIcon name="kill" className="size-4 text-muted-foreground" />
        <span aria-hidden>{sentence}</span>
      </>
    );
  } else {
    body = (
      <>
        <Who side={e.side} who={feedWho(e.side, e.byMe, mySide)} />
        <span className="inline-flex items-center gap-1 text-foreground">
          {weaponArt(e.weapon) ? (
            <WeaponArt weapon={e.weapon} className="h-4 w-10" />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {e.weapon ?? NOT_AVAILABLE_MARK}
            </span>
          )}
          {e.headshot ? (
            <span data-feed-headshot>
              <HudIcon name="headshot" className="size-4" />
            </span>
          ) : null}
        </span>
        <Who side={e.victimSide} who={feedWho(e.victimSide, e.onMe, mySide)} />
      </>
    );
  }
  return (
    <span
      className={cn(
        "vgl-feed inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1 text-sm",
        frame,
      )}
      style={{ "--vgl-i": index } as CSSProperties}
      title={sentence}
      data-feed-line={e.type}
      data-feed-me={e.byMe ? "kill" : e.onMe ? "death" : "none"}
    >
      <span className="sr-only">{sentence}</span>
      {body}
      {e.traded ? (
        <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
          {t("rounds.tag.traded")}
        </span>
      ) : null}
    </span>
  );
}

/** Small marks under a round chip: your opening kill or death, a clutch, the bomb's fate. */
export function RoundMarks({ r }: { r: RoundReport }) {
  const marks: { key: string; node: ReactNode }[] = [];
  if (r.opening.status === "OK" && r.opening.byMe)
    marks.push({
      key: "opening-kill",
      node: <GameIcon name="opening" className="size-3 text-primary" />,
    });
  if (r.opening.status === "OK" && r.opening.onMe)
    marks.push({
      key: "opening-death",
      node: <HudIcon name="icon_skull_default" className="size-3 text-destructive" />,
    });
  if (r.clutch)
    marks.push({ key: "clutch", node: <GameIcon name="clutch" className="size-3 text-context" /> });
  if (r.postPlant?.defused)
    marks.push({
      key: "defused",
      node: <HudIcon name="icon_defuse_default" className="size-3 text-side-ct" />,
    });
  else if (r.postPlant?.exploded)
    marks.push({
      key: "exploded",
      node: <HudIcon name="icon_bomb_explosion_default" className="size-3 text-side-t" />,
    });
  else if (r.postPlant)
    marks.push({
      key: "planted",
      node: <HudIcon name="icon_c4_default" className="size-3 text-side-t" />,
    });
  return (
    <span
      aria-hidden
      className="flex h-3 items-center justify-center gap-0.5"
      data-round-marks={marks.map((m) => m.key).join(" ") || "none"}
    >
      {marks.map((m) => (
        <span key={m.key}>{m.node}</span>
      ))}
    </span>
  );
}

/** The legend for `RoundMarks` (only real kinds of mark). */
export function RoundMarksLegend() {
  const t = useT();
  const items: [ReactNode, TranslationKey][] = [
    [<GameIcon key="o" name="opening" className="size-3 text-primary" />, "vgl3.marks.openingKill"],
    [
      <HudIcon key="d" name="icon_skull_default" className="size-3 text-destructive" />,
      "vgl3.marks.openingDeath",
    ],
    [<GameIcon key="c" name="clutch" className="size-3 text-context" />, "vgl3.marks.clutch"],
    [
      <HudIcon key="p" name="icon_c4_default" className="size-3 text-side-t" />,
      "vgl3.marks.planted",
    ],
    [
      <HudIcon key="x" name="icon_bomb_explosion_default" className="size-3 text-side-t" />,
      "vgl3.marks.exploded",
    ],
    [
      <HudIcon key="f" name="icon_defuse_default" className="size-3 text-side-ct" />,
      "vgl3.marks.defused",
    ],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" data-marks-legend>
      {items.map(([icon, key]) => (
        <li key={key} className="flex items-center gap-1.5">
          {icon}
          {t(key)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Round navigation for the round list: one chip per round (side colour, won filled). Selecting a
 * round opens its card and brings it into view; nothing is loaded or computed.
 */
export function RoundJump({ rounds }: { rounds: RoundReport[] }) {
  const t = useT();
  const go = (n: number) => {
    const el = document.querySelector<HTMLLIElement>(`[data-round="${n}"][data-round-valid]`);
    if (!el) return;
    const d = el.querySelector("details");
    if (d) d.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("vgl-focus");
    void el.offsetWidth;
    el.classList.add("vgl-focus");
  };
  return (
    <nav aria-label={t("vgl3.jump.label")} className="mb-4" data-round-jump>
      <ol className="flex gap-1.5 overflow-x-auto pb-1">
        {rounds.map((r) => {
          const state = r.side && r.won !== null ? (r.won ? "won" : "lost") : "unknown";
          const label = fill(t("room.strip.round"), {
            n: r.roundNumber,
            side: r.side ?? NOT_AVAILABLE_MARK,
            outcome: t(`room.strip.${state}` as TranslationKey),
          });
          return (
            <li key={r.roundNumber} className="flex shrink-0 flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => go(r.roundNumber)}
                aria-label={label}
                title={label}
                data-jump-round={r.roundNumber}
                className={cn(
                  "flex size-9 items-center justify-center rounded border font-mono text-xs transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  state === "unknown"
                    ? "border-dashed border-border text-muted-foreground"
                    : r.side === "CT"
                      ? "border-side-ct text-side-ct"
                      : "border-side-t text-side-t",
                  state === "won" && (r.side === "CT" ? "bg-side-ct/25" : "bg-side-t/25"),
                )}
              >
                {r.roundNumber}
              </button>
              <RoundMarks r={r} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * A compact scoreboard line: the final score and result when the server resolved them; otherwise
 * an explicit "not determined", never 0 : 0.
 */
export function ScoreLine({
  result,
  scorePlayer,
  scoreOpponent,
  className,
}: {
  result: "win" | "loss" | "draw" | null;
  scorePlayer: number | null;
  scoreOpponent: number | null;
  className?: string;
}) {
  const t = useT();
  const known = scorePlayer !== null && scoreOpponent !== null;
  return (
    <div
      className={cn("flex flex-col items-end gap-1", className)}
      data-scoreline={known ? "known" : "unknown"}
    >
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {t("vgl3.score.label")}
      </span>
      {known ? (
        <span className="vgl-score font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
          <span className={result === "win" ? "text-primary" : "text-foreground"}>
            {scorePlayer}
          </span>
          <span className="mx-1.5 text-muted-foreground">:</span>
          <span className={result === "loss" ? "text-destructive" : "text-foreground"}>
            {scoreOpponent}
          </span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">{t("vgl3.score.unknown")}</span>
      )}
    </div>
  );
}
