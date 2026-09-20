import { AlertTriangle, CheckCircle2, Cpu, FileSearch, Loader2, ShieldAlert, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ClientParserError } from "@/lib/client-parser/clientParser.errors";
import { verifyClientParserResult } from "@/lib/client-parser/clientParser.functions";
import type { ClientParserProgress } from "@/lib/client-parser/clientParser.service";
import { ClientParserService } from "@/lib/client-parser/clientParser.service";
import type { ClientParserEnvelope } from "@/lib/client-parser/clientParser.types";

function bytes(value: number) { return new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 2 }).format(value / 1024 / 1024); }

export function ClientParserPoc() {
  const service = useRef<ClientParserService | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ClientParserProgress | null>(null);
  const [result, setResult] = useState<ClientParserEnvelope | null>(null);
  const [verification, setVerification] = useState<Awaited<ReturnType<typeof verifyClientParserResult>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const select = (next: File | undefined) => {
    setError(null); setResult(null); setVerification(null); setProgress(null);
    if (!next || !next.name.toLowerCase().endsWith(".dem")) { setFile(null); if (next) setError("Selecione um arquivo .dem válido."); return; }
    setFile(next);
  };
  const run = async () => {
    if (!file) return;
    setRunning(true); setError(null); setResult(null); setVerification(null);
    const current = new ClientParserService(); service.current = current;
    try { setResult(await current.parse(file, setProgress)); }
    catch (reason) { setError(reason instanceof ClientParserError ? reason.code : "CLIENT_WORKER_FAILED"); }
    finally { setRunning(false); service.current = null; }
  };
  const cancel = () => { service.current?.cancel(); service.current = null; setRunning(false); setProgress({ stage: "CANCELLED", progress: 0, elapsedMs: 0 }); };
  const verify = async () => { if (result) setVerification(await verifyClientParserResult({ data: result })); };

  return <div className="space-y-5">
    <div className="flex items-start gap-3 border-l-2 border-success bg-success/8 px-4 py-3 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      <div><p className="font-medium text-foreground">Arquivo processado localmente — nenhum .DEM enviado.</p><p className="mt-1 text-muted-foreground">Resultado do cliente é não confiável até validação do servidor.</p></div>
    </div>
    <div className="border border-dashed border-border bg-card/40 p-6 text-center">
      <FileSearch className="mx-auto size-7 text-primary" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-foreground">Selecione uma demo local</p>
      <p className="mt-1 text-xs text-muted-foreground">O arquivo permanece neste navegador.</p>
      <input ref={input} type="file" accept=".dem" className="sr-only" onChange={(event) => select(event.target.files?.[0])} />
      <Button className="mt-4" variant="outline" onClick={() => input.current?.click()} disabled={running}>Escolher .DEM</Button>
    </div>
    {file ? <div className="grid gap-3 border border-border bg-card/40 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Arquivo</p><p className="break-all text-sm font-medium">{file.name}</p></div><div><p className="text-xs text-muted-foreground">Tamanho</p><p className="font-mono text-sm">{bytes(file.size)}</p></div><div><p className="text-xs text-muted-foreground">Upload</p><p className="font-mono text-sm text-success">NÃO ENVIADO</p></div></div> : null}
    {progress ? <div className="space-y-2"><div className="flex justify-between font-mono text-xs text-muted-foreground"><span>{progress.stage}</span><span>{Math.round(progress.progress * 100)}%</span></div><Progress value={progress.progress * 100} /></div> : null}
    <div className="flex flex-wrap gap-2">
      <Button onClick={run} disabled={!file || running}>{running ? <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" /> : <Cpu className="mr-2 size-4" />}Processar localmente</Button>
      {running ? <Button variant="outline" onClick={cancel}><Square className="mr-2 size-4" />Cancelar</Button> : null}
      {result ? <Button variant="outline" onClick={verify}><ShieldAlert className="mr-2 size-4" />Validar resultado</Button> : null}
    </div>
    {error ? <div role="alert" className="flex gap-2 border border-warning/30 bg-warning/8 p-4 text-sm text-warning"><AlertTriangle className="size-4 shrink-0" />{error}</div> : null}
    {result ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="SHA-256" value={result.result.demo.sha256} mono />
      <Metric label="Parser" value={`${result.result.parser.name} ${result.result.parser.version}`} />
      <Metric label="Eventos amostrados" value={String(result.result.selectedEventSamples.length)} />
      <Metric label="Resultado compacto" value={`${result.result.performance.resultBytes} bytes`} />
      <Metric label="Hash" value={`${result.result.performance.hashDurationMs.toFixed(1)} ms`} />
      <Metric label="Parse" value={`${result.result.performance.parseDurationMs.toFixed(1)} ms`} />
      <Metric label="Digest" value={result.result.resultDigest} mono />
      <Metric label="Tick probe" value={`${result.result.tickProbe.status} · ${result.result.tickProbe.returnedTickCount}/${result.result.tickProbe.requestedTickCount}`} />
    </div> : null}
    {verification ? <div className="border border-border bg-card/40 p-4 text-sm"><p className="font-semibold">Servidor: {verification.accepted ? "resultado não confiável validado" : `bloqueado (${verification.reasonCode})`}</p><p className="mt-1 text-muted-foreground">Canonical: BLOCKED · Persistido: não</p></div> : null}
  </div>;
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border border-border bg-card/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`${mono ? "font-mono text-xs" : "text-sm"} mt-1 break-all text-foreground`}>{value}</p></div>;
}
