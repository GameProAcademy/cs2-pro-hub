import { readFileSync, writeFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { I18nProvider } from "@/i18n";
import { HeatmapBody, DrillDown } from "@/components/real/RealHeatmap";
import { buildHeatmap } from "@/lib/spatial/heatmap";
import type { PlayerRound } from "@/lib/roundContext";

const dir = process.argv[2]!;
const bench = JSON.parse(readFileSync(`${dir}/bench_events.json`, "utf8"));
const after = { rounds: JSON.parse(readFileSync(`${dir}/rounds.json`, "utf8")) };
const me: string = bench.me;
const rounds: PlayerRound[] = after.rounds.map((r: any) => ({
  round: r.number, side: (r.sides?.[me] ?? "UNKNOWN"), outcome: "UNKNOWN", kills: 0, deaths: 0, damage: 0,
}));
const layer = (process.argv[3] ?? "DEATHS") as "DEATHS" | "KILLS";
const h = buildHeatmap([{ matchId: "bench", map: "de_dust2", participantKey: me, rounds, events: bench.events }],
  { map: "de_dust2", layer, side: "ALL", level: "default" });
const r = { maps: [{ map: "de_dust2", support: "SUPPORTED" as const, matches: 1 }], matches: [{ matchId: "bench", playedAt: "2026-10-23T08:38:19Z", dateSource: "processed" as const }], heatmap: h };
const top = [...h.cells].sort((a, b) => b.count - a.count)[0]!;
const html = renderToString(
  <QueryClientProvider client={new QueryClient()}>
    <I18nProvider initialLocale="pt-BR">
      <main className="mx-auto max-w-6xl p-4"><HeatmapBody r={r} search={{}} onSearch={() => {}} /><div className="mt-6"><DrillDown h={h} cell={top.cell} matches={r.matches} /></div></main>
    </I18nProvider>
  </QueryClientProvider>,
);
const css = readFileSync(process.argv[4]!, "utf8");
writeFileSync(`${dir}/heatmap-${layer}.html`, `<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="bg-background text-foreground">${html.replaceAll('href="/radars/', 'href="file://' + process.cwd() + '/public/radars/')}</body></html>`);
console.log(layer, h.events.status, h.events.value, JSON.stringify(h.events.coverage), "perRound", h.perRound.status, h.perRound.value, "cells", h.cells.length);
