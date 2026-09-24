import { Clipboard, FlaskConical, Loader2, Square, Trash2 } from "lucide-react";
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

export function BrowserMemoryLab() {
  const [selectedSize, setSelectedSize] = useState(16 * 1024 * 1024);
  const [runs, setRuns] = useState(1);
  const [results, setResults] = useState<MemoryMeasurementResult[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const availability = useMemo(
    () => browserMemoryMeasurementAvailability(FEATURES.clientDemMemoryLab),
    [],
  );

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

  const copyReport = async () => {
    await navigator.clipboard.writeText(serializeBrowserMemoryDiagnosticReport(results));
    setCopied(true);
  };

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="memory-lab-title">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase text-warning">
            Experimental / diagnostic only / non-production / no real DEM
          </p>
          <h2 id="memory-lab-title" className="mt-1 text-lg font-semibold text-foreground">
            Experimental — Browser Memory Lab
          </h2>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Esta ferramenta mede somente o comportamento de memória do navegador usando fixtures
            sintéticos. Nenhum DEM real é processado e os resultados não autorizam aumento do limite
            de 128 MiB.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Status label="API disponível" value={availability === "AVAILABLE" ? "SIM" : "NÃO"} />
        <Status
          label="Contexto seguro"
          value={globalThis.isSecureContext === true ? "SIM" : "NÃO"}
        />
        <Status
          label="Cross-origin isolated"
          value={globalThis.crossOriginIsolated === true ? "SIM" : "NÃO"}
        />
      </div>
      {availability !== "AVAILABLE" ? (
        <p className="border border-warning/30 bg-warning/8 p-3 font-mono text-xs text-warning">
          {availability}
        </p>
      ) : null}

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
          Executar tamanho selecionado
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MEMORY_LAB_FIXTURE_SIZES.map((size) => (
          <Button
            key={size}
            variant="outline"
            size="sm"
            onClick={() => void execute(size)}
            disabled={running || availability !== "AVAILABLE"}
          >
            Run {mib(size)}
          </Button>
        ))}
        {running ? (
          <Button variant="outline" size="sm" onClick={() => abortController.current?.abort()}>
            <Square className="mr-2 size-3.5" />
            Cancelar
          </Button>
        ) : null}
      </div>

      <div className="border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Size</TableHead>
              <TableHead>Run</TableHead>
              <TableHead>Baseline</TableHead>
              <TableHead>Observed sample</TableHead>
              <TableHead>Delta</TableHead>
              <TableHead>Post cleanup</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-16 text-center text-muted-foreground">
                  NOT_RUN
                </TableCell>
              </TableRow>
            ) : (
              results.map((result, index) => (
                <TableRow key={`${result.timestamp}-${index}`}>
                  <TableCell>{mib(result.fixtureSizeBytes)}</TableCell>
                  <TableCell>{result.repetition}</TableCell>
                  <TableCell>{memory(result.baselineBytes)}</TableCell>
                  <TableCell>{memory(result.observedPeakBytes)}</TableCell>
                  <TableCell>{memory(result.peakDeltaBytes)}</TableCell>
                  <TableCell>{memory(result.postCleanupBytes)}</TableCell>
                  <TableCell>
                    {result.materializationDurationMs === null
                      ? "—"
                      : `${result.materializationDurationMs.toFixed(1)} ms`}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{result.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
          onClick={() => {
            setResults([]);
            setCopied(false);
          }}
          disabled={results.length === 0 || running}
        >
          <Trash2 className="mr-2 size-3.5" />
          Limpar resultados locais
        </Button>
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}
