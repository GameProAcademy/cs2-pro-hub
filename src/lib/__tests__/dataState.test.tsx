import { describe, expect, it } from "vitest";
import { METRIC_STATUSES } from "@/lib/metrics/metricContract";
import { dataStateText } from "@/components/common/DataState";
import { roomPtBR } from "@/i18n/locales/room/pt-BR";
import { roomPtPT } from "@/i18n/locales/room/pt-PT";
import { roomEn } from "@/i18n/locales/room/en";
import { roomEs } from "@/i18n/locales/room/es";
import { roomFr } from "@/i18n/locales/room/fr";

const LOCALES = { roomPtBR, roomPtPT, roomEn, roomEs, roomFr } as Record<
  string,
  Record<string, string>
>;

describe("UX-1.4 data states (R-10)", () => {
  it("every contract status has a text in all five languages", () => {
    for (const [name, dict] of Object.entries(LOCALES))
      for (const s of METRIC_STATUSES) expect(dict[`state.${s}`], `${name} ${s}`).toBeTruthy();
  });
  it("same key set in all five languages", () => {
    const keys = (d: Record<string, string>) =>
      Object.keys(d)
        .filter((k) => k.startsWith("state."))
        .sort();
    const base = keys(roomPtBR as Record<string, string>);
    for (const d of Object.values(LOCALES)) expect(keys(d)).toEqual(base);
  });
  const t = (k: string) => (roomPtBR as Record<string, string>)[k] ?? k;
  it("partial shows coverage; insufficient shows n of minimum; never a zero", () => {
    expect(
      dataStateText(t as never, { status: "PARTIAL", coverage: { measured: 2, eligible: 3 } }),
    ).toBe("Parte das partidas: 2 de 3");
    expect(
      dataStateText(t as never, {
        status: "INSUFFICIENT_SAMPLE",
        sample: { n: 4, unit: "tentativas" },
        minimum: 10,
      }),
    ).toBe("Amostra insuficiente: 4 de 10 tentativas");
    expect(dataStateText(t as never, { status: "NOT_MEASURED" })).toBe("O CS2 PRO não mede isto");
    expect(dataStateText(t as never, { status: "NOT_OBSERVED" })).not.toMatch(/\b0\b/);
  });
});
