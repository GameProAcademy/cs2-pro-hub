import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, CheckCircle2, FileLock2, Loader2, Pause, ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  R5_AUTHORIZED_DEM_FILENAME,
  R5_AUTHORIZED_DEM_SHA256,
  R5_AUTHORIZED_DEM_SIZE_BYTES,
  R5_CANONICAL_RELEASE_ID,
  R5_FORENSIC_STAGING_BUCKET,
  R5_FORENSIC_STORAGE_PATH,
} from "@/config/r5ForensicStaging";
import {
  getR5ForensicDemo,
  prepareR5ForensicDemo,
  recordR5ForensicProgress,
  recordR5ForensicUpload,
  verifyR5ForensicDemo,
} from "@/lib/r5ForensicStaging.functions";
import {
  uploadR5DemoResumably,
  verifyAuthorizedR5FileLocally,
  type R5UploadProgress,
} from "@/lib/pipeline/r5ResumableUpload";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/r5-forensic")({
  head: () => ({
    meta: [
      { title: "R5 Forensic Staging — Administração GamePro" },
      { name: "description", content: "Transporte privado e verificação controlada do DEM forense autorizado da GamePro." },
      { property: "og:title", content: "R5 Forensic Staging — Administração GamePro" },
      { property: "og:description", content: "Transporte privado e verificação controlada do DEM forense autorizado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: R5ForensicPage,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[180px_1fr]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

function R5ForensicPage() {
  const { adminSession } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const lastProgressAuditRef = useRef(-1);
  const progressAuditChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const [file, setFile] = useState<File | null>(null);
  const [hashPercent, setHashPercent] = useState(0);
  const [progress, setProgress] = useState<R5UploadProgress | null>(null);
  const [localEvidence, setLocalEvidence] = useState<{ sha256: string; size: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const staging = useQuery({
    queryKey: ["admin", "r5-forensic"],
    queryFn: () => getR5ForensicDemo(),
    refetchInterval: 15_000,
  });

  const upload = useMutation({
    mutationFn: async (selected: File) => {
      setMessage(null);
      setHashPercent(0);
      setProgress(null);
      setLocalEvidence(null);
      lastProgressAuditRef.current = -1;
      progressAuditChainRef.current = Promise.resolve();
      const controller = new AbortController();
      abortRef.current = controller;
      const local = await verifyAuthorizedR5FileLocally(selected, setHashPercent, controller.signal);
      setLocalEvidence(local);
      const slot = await prepareR5ForensicDemo();
      await recordR5ForensicUpload({ data: { stagingId: slot.id, state: "started" } });
      try {
        const transport = await uploadR5DemoResumably(selected, {
          signal: controller.signal,
          onProgress: (next) => {
            setProgress(next);
            const milestone = Math.floor(next.percent / 10) * 10;
            if (milestone > lastProgressAuditRef.current) {
              lastProgressAuditRef.current = milestone;
              progressAuditChainRef.current = progressAuditChainRef.current.then(() =>
                recordR5ForensicProgress({ data: {
                  stagingId: slot.id,
                  bytesUploaded: next.bytesSent,
                  bytesTotal: next.bytesTotal,
                  percent: milestone,
                  retryCount: next.retryCount,
                  resumed: next.resumed,
                }),
              );
            }
          },
        });
        await progressAuditChainRef.current;
        await recordR5ForensicProgress({ data: {
          stagingId: slot.id,
          bytesUploaded: selected.size,
          bytesTotal: selected.size,
          percent: 100,
          retryCount: transport.retryCount,
          resumed: transport.resumed,
        } });
        await recordR5ForensicUpload({ data: { stagingId: slot.id, state: "completed" } });
        return slot.id;
      } catch (error) {
        const cancelled = error instanceof DOMException && error.name === "AbortError";
        const code = cancelled ? "R5_UPLOAD_CANCELLED" : "R5_UPLOAD_FAILED";
        await recordR5ForensicUpload({ data: { stagingId: slot.id, state: cancelled ? "cancelled" : "failed", errorCode: code } });
        throw error;
      } finally {
        abortRef.current = null;
      }
    },
    onSuccess: async () => {
      setMessage("UPLOAD COMPLETED · SERVER VERIFICATION NOT RUN");
      await queryClient.invalidateQueries({ queryKey: ["admin", "r5-forensic"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "R5_UPLOAD_FAILED"),
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      const current = staging.data;
      if (!current) throw new Error("R5_STAGING_NOT_FOUND");
      return verifyR5ForensicDemo({ data: { stagingId: current.id } });
    },
    onSuccess: async () => {
      setMessage("SERVER VERIFICATION COMPLETED");
      await queryClient.invalidateQueries({ queryKey: ["admin", "r5-forensic"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "R5_VERIFICATION_FAILED"),
  });

  const status = staging.data?.status ?? "READY_FOR_REAL_DEM_STAGING";
  const statusReady = status === "READY_FOR_EXECUTION";
  const canVerify = staging.data?.status === "UPLOADED_UNVERIFIED";

  return (
    <AdminShell session={adminSession}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="FASE 2.7.2G.6 · R5.6"
          title="R5 Forensic Staging"
          description="Transporte privado e verificação independente do DEM autorizado. Nenhuma execução do pipeline é iniciada nesta tela."
        />

        {staging.isLoading ? <LoadingState /> : staging.isError ? <ErrorState onRetry={() => void staging.refetch()} /> : null}

        <section className="border-y border-border bg-card/50 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                <FileLock2 className="size-5" aria-hidden />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Current status</p>
                <p className={cn("font-display text-lg font-semibold", statusReady ? "text-success" : "text-warning")}>{status}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <Ban className="size-4" aria-hidden /> Attempt 9 locked · Canonical locked
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4 border-t border-border pt-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Authorized identity</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Cache match DEM</h2>
            </div>
            <dl>
              <EvidenceRow label="filename" value={R5_AUTHORIZED_DEM_FILENAME} />
              <EvidenceRow label="expected size" value={`${R5_AUTHORIZED_DEM_SIZE_BYTES} bytes`} />
              <EvidenceRow label="expected SHA-256" value={R5_AUTHORIZED_DEM_SHA256} />
              <EvidenceRow label="canonical release" value={R5_CANONICAL_RELEASE_ID} />
              <EvidenceRow label="bucket" value={R5_FORENSIC_STAGING_BUCKET} />
              <EvidenceRow label="object path" value={R5_FORENSIC_STORAGE_PATH} />
               <EvidenceRow label="local size" value={localEvidence ? `${localEvidence.size} bytes` : "NOT VERIFIED"} />
               <EvidenceRow label="local SHA-256" value={localEvidence?.sha256 ?? "NOT VERIFIED"} />
              <EvidenceRow label="observed size" value={staging.data?.observedSize == null ? "NOT VERIFIED" : `${staging.data.observedSize} bytes`} />
              <EvidenceRow label="observed SHA-256" value={staging.data?.observedSha256 ?? "NOT VERIFIED"} />
              <EvidenceRow label="bytes readable" value={staging.data?.bytesReadable ? "VERIFIED" : "NOT VERIFIED"} />
            </dl>
          </section>

          <section className="space-y-4 border-t border-border pt-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Controlled transport</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Resumable upload</h2>
            </div>
            <input
              type="file"
              accept=".dem"
              aria-label="Select the authorized R5 DEM"
              disabled={upload.isPending || verify.isPending || statusReady}
              className="block w-full border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:text-foreground"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setMessage(null);
              }}
            />
            {file ? <p className="font-mono text-xs text-muted-foreground">{file.name} · {formatBytes(file.size)}</p> : null}

            {upload.isPending ? (
              <div className="space-y-2" aria-live="polite">
                <div className="flex justify-between font-mono text-xs text-muted-foreground">
                  <span>{progress ? "UPLOADING" : "LOCAL SHA-256"}</span>
                  <span>{progress?.percent ?? hashPercent}%</span>
                </div>
                <Progress value={progress?.percent ?? hashPercent} />
                {progress ? (
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                    <span>{formatBytes(progress.bytesSent)} sent</span>
                    <span>{formatBytes(progress.bytesTotal)} total</span>
                    <span>{formatBytes(progress.bytesPerSecond)}/s</span>
                    <span>ETA {progress.etaSeconds == null ? "—" : `${progress.etaSeconds}s`}</span>
                     <span>Retries {progress.retryCount}</span>
                     <span>{progress.resumed ? "RESUMED" : "NEW UPLOAD"}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button disabled={!file || upload.isPending || verify.isPending || statusReady} onClick={() => file && upload.mutate(file)}>
                {upload.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadCloud className="size-4" aria-hidden />}
                {staging.data?.bytesUploaded ? "Resume upload" : "Start upload"}
              </Button>
              {upload.isPending ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Pause className="size-4" aria-hidden /> Cancel safely
                </Button>
              ) : null}
              <Button variant="outline" disabled={!canVerify || upload.isPending || verify.isPending || statusReady} onClick={() => verify.mutate()}>
                {verify.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
                Verify stored bytes
              </Button>
            </div>
            {message ? <p role="status" className="border-l-2 border-primary pl-3 font-mono text-xs text-muted-foreground">{message}</p> : null}
            {!staging.data ? <p role="status" className="font-mono text-xs text-warning">Waiting for physical authorized DEM upload.</p> : null}
            {statusReady ? (
              <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden /> Ready for controlled forensic execution. No execution was started.</p>
            ) : null}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}