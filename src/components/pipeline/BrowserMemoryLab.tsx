import { Check, Clipboard, FlaskConical, Loader2, RotateCcw, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FEATURES } from "@/config/app";
import {
  MEMORY_LAB_FIXTURE_SIZES,
  createSyntheticFixtureDescriptor,
  type MemoryMeasurementResult,
} from "@/lib/client-parser/memoryMeasurement";
import {
  browserMemoryMeasurementAvailability,
  runSyntheticMemoryMeasurement,
} from "@/lib/client-parser/memoryMeasurement.runner";
import { serializeBrowserMemoryDiagnosticReport } from "@/lib/client-parser/memoryMeasurementReport";

const mib = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MiB`;
const memory = (bytes: number | null) =>
  bytes === null ? "—" : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const milliseconds = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)} ms`);

export function BrowserMemoryLab() {
  const [selectedSize, setSelectedSize] = useState(16 * 1024 * 1024);
  const [runs, setRuns] = useState(3);
  const [results, setResults] = useState<MemoryMeasurementResult[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const availability = useMemo(
    () => browserMemoryMeasurementAvailability(FEATURES.clientDemMemoryLab),
    [],
  );
  const capabilities = useMemo(() => {
    const memoryPerformance = globalThis.performance as Performance & {
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
    };
    return {
      secureContext: globalThis.isSecureContext === true,
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      memoryApi: typeof memoryPerformance?.measureUserAgentSpecificMemory === "function",
      worker: typeof Worker !== "undefined",
      fileApi: typeof File !== "undefined" && typeof Blob !== "undefined",
    };
  }, []);

  if (!FEATURES.clientDemMemoryLab) return null;

  const execute = async (sizeBytes = selectedSize) => {
    if (running || availability !== "AVAILABLE") return;
    setRunning(true);
    setCopied(false);
    const controller = new AbortController();
    abortController.current = controller;
    try {
      for (let repetition = 1; repetition <= runs; repetition += 1) {
        if (controller.signal.aborted) break;
        const result = await runSyntheticMemoryMeasurement(
          createSyntheticFixtureDescriptor(sizeBytes),
          {
            featureEnabled: FEATURES.clientDemMemoryLab,
            repetition,
            signal: controller.signal,
          },
        );
        setResults((current) => [...current, result]);
        if (result.status !== "OBSERVED") break;
      }
    } finally {
      abortController.current = null;
      setRunning(false);
    }
  };

  const resetSession = () => {
    setResults([]);
    setCopied(false);
  };

  const copyReport = async () => {
    await navigator.clipboard.writeText(serializeBrowserMemoryDiagnosticReport(results));
    setCopied(true);
  };

  return (
    <div className="space-y-6">
      <section
        className="border-l-2 border-warning bg-warning/8 px-4 py-3"
        aria-labelledby="memory-lab-title"
      >
        <p className="font-mono text-xs font-semibold uppercase text-warning">
          Experimental / Diagnostic Only / Non-Production / No Real DEM
        </p>
        <h2 id="memory-lab-title" className="mt-2 text-lg font-semibold text-foreground">
          Browser Memory Lab
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Sessão local e sintética. Nenhum resultado é enviado ou persistido. O teto permanece 128
          MiB.
        </p>
      </section>

      <section aria-labelledby="safety-status-title">
        <h3
          id="safety-status-title"
          className="mb-3 font-mono text-xs uppercase text-muted-foreground"
        >
          Status de segurança e capacidades
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Status label="Memory Lab flag" value="ENABLED" positive />
          <Status
            label="Secure context"
            value={capabilities.secureContext ? "YES" : "NO"}
            positive={capabilities.secureContext}
          />
          <Status
            label="Cross-origin isolated"
            value={capabilities.crossOriginIsolated ? "YES" : "NO"}
            positive={capabilities.crossOriginIsolated}
          />
          <Status
            label="Memory API"
            value={capabilities.memoryApi ? "AVAILABLE" : "UNAVAILABLE"}
            positive={capabilities.memoryApi}
          />
          <Status
            label="Worker"
            value={capabilities.worker ? "AVAILABLE" : "UNAVAILABLE"}
            positive={capabilities.worker}
          />
          <Status
            label="File API"
            value={capabilities.fileApi ? "AVAILABLE" : "UNAVAILABLE"}
            positive={capabilities.fileApi}
          />
          <Status label="Real parser / Real DEM" value="DISABLED / BLOCKED" />
          <Status label="Canonical / Railway / R5.8" value="LOCKED / UNCHANGED" />
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">RUN GATE: {availability}</p>
      </section>

      <section className="space-y-3" aria-labelledby="protocol-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="protocol-title" className="font-semibold text-foreground">
              Protocolo H.1-M
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              16 / 32 / 64 / 96 / 128 MiB × 3 repetições · 15 execuções manuais.
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {results.filter((result) => result.status === "OBSERVED").length} observações locais
          </p>
        </div>
        <div className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-5">
          {MEMORY_LAB_FIXTURE_SIZES.map((size) => (
            <div key={size} className="bg-card p-3">
              <p className="font-mono text-xs font-semibold text-foreground">{mib(size)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[1, 2, 3].map((repetition) => {
                  const observed = results.some(
                    (result) =>
                      result.fixtureSizeBytes === size &&
                      result.repetition === repetition &&
                      result.status === "OBSERVED",
                  );
                  return (
                    <div
                      key={repetition}
                      className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
                    >
                      <span
                        className={`flex size-5 items-center justify-center border ${observed ? "border-success text-success" : "border-border"}`}
                      >
                        {observed ? <Check className="size-3" aria-hidden /> : null}
                      </span>
                      R{repetition}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="run-controls-title">
        <h3 id="run-controls-title" className="font-semibold text-foreground">
          Execução manual
        </h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="space-y-1 text-xs text-muted-foreground">
            Tamanho sintético
            <Select
              value={String(selectedSize)}
              onValueChange={(value) => setSelectedSize(Number(value))}
              disabled={running}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMORY_LAB_FIXTURE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {mib(size)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Repetições
            <Select
              value={String(runs)}
              onValueChange={(value) => setRuns(Number(value))}
              disabled={running}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button onClick={() => void execute()} disabled={running || availability !== "AVAILABLE"}>
            {running ? (
              <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <FlaskConical className="mr-2 size-4" />
            )}
            Executar seleção
          </Button>
        </div>
        {running ? (
          <Button variant="outline" size="sm" onClick={() => abortController.current?.abort()}>
            <Square className="mr-2 size-3.5" />
            Cancelar
          </Button>
        ) : null}
        {availability !== "AVAILABLE" ? (
          <p className="border border-warning/30 bg-warning/8 p-3 font-mono text-xs text-warning">
            {availability} · execução bloqueada
          </p>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="results-title">
        <h3 id="results-title" className="font-semibold text-foreground">
          Resultados locais
        </h3>
        <div className="overflow-x-auto border border-border">
          <Table className="min-w-[1700px]">
            <TableHeader>
              <TableRow>
                <TableHead>fixtureSizeBytes</TableHead>
                <TableHead>repetition</TableHead>
                <TableHead>baselineBytes</TableHead>
                <TableHead>postFixtureBytes</TableHead>
                <TableHead>preMaterializationBytes</TableHead>
                <TableHead>postMaterializationBytes</TableHead>
                <TableHead>postCleanupBytes</TableHead>
                <TableHead>observedPeakBytes</TableHead>
                <TableHead>peakDeltaBytes</TableHead>
                <TableHead>observedCleanupDeltaBytes</TableHead>
                <TableHead>materializationDurationMs</TableHead>
                <TableHead>workerDurationMs</TableHead>
                <TableHead>materializedByteLength</TableHead>
                <TableHead>measurementCount</TableHead>
                <TableHead>cleanupStatus</TableHead>
                <TableHead>status</TableHead>
                <TableHead>errorCode</TableHead>
                <TableHead>timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={18} className="h-16 text-center text-muted-foreground">
                    NOT_RUN
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result, index) => (
                  <TableRow key={`${result.timestamp}-${index}`}>
                    <TableCell title={String(result.fixtureSizeBytes)}>
                      {mib(result.fixtureSizeBytes)}
                    </TableCell>
                    <TableCell>{result.repetition}</TableCell>
                    <TableCell>{memory(result.baselineBytes)}</TableCell>
                    <TableCell>{memory(result.postFixtureBytes)}</TableCell>
                    <TableCell>{memory(result.preMaterializationBytes)}</TableCell>
                    <TableCell>{memory(result.postMaterializationBytes)}</TableCell>
                    <TableCell>{memory(result.postCleanupBytes)}</TableCell>
                    <TableCell>{memory(result.observedPeakBytes)}</TableCell>
                    <TableCell>{memory(result.peakDeltaBytes)}</TableCell>
                    <TableCell>{memory(result.observedCleanupDeltaBytes)}</TableCell>
                    <TableCell>{milliseconds(result.materializationDurationMs)}</TableCell>
                    <TableCell>{milliseconds(result.workerDurationMs)}</TableCell>
                    <TableCell>{result.materializedByteLength ?? "—"}</TableCell>
                    <TableCell>{result.measurementCount}</TableCell>
                    <TableCell className="font-mono text-xs">{result.cleanupStatus}</TableCell>
                    <TableCell className="font-mono text-xs">{result.status}</TableCell>
                    <TableCell className="font-mono text-xs">{result.errorCode ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{result.timestamp}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Observed peak = máximo entre amostras observadas nos pontos definidos pelo protocolo; não
          representa pico absoluto nem uma medição garantida durante a materialização. O delta
          pós-cleanup é somente uma observação aritmética, sem diagnóstico.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copyReport()}
          disabled={results.length === 0 || running}
        >
          <Clipboard className="mr-2 size-3.5" />
          {copied ? "Relatório copiado" : "Copiar relatório diagnóstico"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={resetSession}
          disabled={results.length === 0 || running}
        >
          <RotateCcw className="mr-2 size-3.5" />
          Reset H.1-M session
        </Button>
      </div>
    </div>
  );
}

function Status({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="border border-border bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xs ${positive ? "text-success" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
