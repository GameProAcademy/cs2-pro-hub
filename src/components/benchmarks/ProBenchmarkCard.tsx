/**
 * PM5 / 4.2.10 — module J: professional benchmark status. Shows the `cs2.pro-benchmark.v1`
 * state from the reviewed source registry (no request, no number). Without a licensed and
 * comparable source it says BENCHMARK_UNAVAILABLE and lists the audited candidates and why
 * they are not used — never an estimated "pro average".
 */
import { ShieldOff } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { useT, type TranslationKey } from "@/i18n";
import {
  benchmarkStatus,
  MIN_SOURCE_MATCHES,
  type BenchmarkStatus,
} from "@/lib/benchmarks/benchmarks";
import { fill } from "@/lib/format";

export function ProBenchmarkCard({ status = benchmarkStatus() }: { status?: BenchmarkStatus }) {
  const t = useT();
  return (
    <ChartCard title={t("benchmarks.title")} subtitle={t("benchmarks.subtitle")}>
      <div className="space-y-3 text-sm" data-benchmark-state={status.state}>
        {status.state === "BENCHMARK_UNAVAILABLE" ? (
          <p className="flex items-start gap-2">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <strong>{t("benchmarks.unavailable.title")}</strong>{" "}
              {t("benchmarks.unavailable.body")}
            </span>
          </p>
        ) : (
          <p>{fill(t("benchmarks.available"), { n: status.licensedSources })}</p>
        )}
        <p className="text-muted-foreground">
          {fill(t("benchmarks.rules"), { min: MIN_SOURCE_MATCHES })}
        </p>
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            {t("benchmarks.audit")}
          </summary>
          <ul className="mt-2 space-y-1" data-benchmark-audit>
            {status.audited.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.name}</span>
                {": "}
                {a.findings.map((f) => t(`benchmarks.finding.${f}` as TranslationKey)).join("; ")}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </ChartCard>
  );
}
