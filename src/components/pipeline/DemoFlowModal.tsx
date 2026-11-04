/**
 * Upload modal — container. A presentation layer over the existing lifecycle:
 *   - reads the job with the existing `getDemoJobStatus` (same query key as the panel);
 *   - reads players with the existing `getDemoIdentity`;
 *   - writes ONLY through the existing actions (`declareDemoPlayer`,
 *     `decideAutomaticDemoPlayer`, `cancelMyDemoJob`), which validate everything server-side
 *     (ownership by RLS, participant key against the match's real participants);
 *   - never creates a job, never uploads, never retries by itself, never declares success:
 *     completion comes only from `isDefinitivelyComplete(job)`.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { DemoFlowView } from "@/components/pipeline/DemoFlowView";
import { deriveIdentityUiState, identityErrorKey } from "@/components/pipeline/DemoPlayerIdentity";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  cancelMyDemoJob,
  getDemoJobStatus,
  retryMyDemoJob,
  type DemoJobView,
} from "@/lib/pipeline.functions";
import { STOPPED_GUIDANCE, classifyDemoJob } from "@/lib/pipeline/errorGuidance";
import {
  decideAutomaticDemoPlayer,
  declareDemoPlayer,
  getDemoIdentity,
} from "@/lib/pipeline-identity.functions";
import {
  acceptJobSnapshot,
  canCancel,
  deriveDemoFlowPhase,
  isLockedPhase,
  warnBeforeUnload,
  type DemoFlowPhase,
  type FlowJob,
  type FlowUpload,
} from "@/lib/pipeline/demoFlow";

export type FlowDismissReason = "background" | "later" | "completed" | "closed";

const STAGE_COPY: Record<string, TranslationKey> = {
  queued: "demoFlow.validate.queued",
  validating: "demoFlow.validate.validating",
  parsing: "pipeline.processing.parsing.title",
  raw_audit: "pipeline.processing.rawAudit.title",
  normalizing: "pipeline.processing.normalizing.title",
  metrics: "pipeline.processing.metrics.title",
  persisting: "pipeline.processing.persisting.title",
  cleanup: "pipeline.processing.cleanup.title",
};

function stageKeyFor(phase: DemoFlowPhase): TranslationKey | null {
  switch (phase.kind) {
    case "waiting_job":
      return "demoFlow.validate.waitingJob";
    case "queued":
      return "demoFlow.validate.queued";
    case "processing":
    case "attaching":
      return STAGE_COPY[phase.stage] ?? null;
    case "identity_loading":
      return "demoFlow.identify.body";
    default:
      return null;
  }
}

const ACTIVE = new Set(["pending", "processing", "cancel_requested"]);
const AUTO_CLOSE_SECONDS = 8;

/** Marks everything outside the dialog `inert` while the flow is locked. */
function useInertBackground(enabled: boolean, contentRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const content = contentRef.current;
    if (!content) return;
    const touched: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child.contains(content) || child.hasAttribute("inert")) continue;
      // Radix portals of other layers (toasts) are left alone only if they contain the dialog.
      child.setAttribute("inert", "");
      touched.push(child);
    }
    return () => {
      for (const child of touched) child.removeAttribute("inert");
    };
  }, [enabled, contentRef]);
}

export function DemoFlowModal({
  open,
  jobId,
  upload,
  interrupted,
  resumed,
  errorKeyFor,
  onDismiss,
  onChooseFileAgain,
  onViewAnalysis,
}: {
  open: boolean;
  jobId: string | null;
  upload: FlowUpload | null;
  interrupted: { fileName: string; fileSize: number } | null;
  resumed: boolean;
  errorKeyFor: (code: string | null) => TranslationKey;
  onDismiss: (reason: FlowDismissReason, jobId: string | null) => void;
  onChooseFileAgain: () => void;
  onViewAnalysis: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const accepted = useRef<FlowJob | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [identityError, setIdentityError] = useState<TranslationKey | null>(null);
  const [cancelAsking, setCancelAsking] = useState(false);
  const [offline, setOffline] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // A different job (or a new upload) starts from a clean slate.
  useEffect(() => {
    accepted.current = null;
    setSelected(null);
    setManualMode(false);
    setIdentityError(null);
    setCancelAsking(false);
    setCountdown(null);
  }, [jobId]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    returnFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [open]);

  // Same key and function as the panel's submission poll: one cache, the real job row.
  const jobQuery = useQuery({
    queryKey: ["pipeline", "submission", jobId],
    queryFn: () => (jobId ? getDemoJobStatus({ data: { jobId } }) : Promise.resolve(null)),
    enabled: open && Boolean(jobId),
    refetchInterval: (query) => {
      const job = query.state.data as DemoJobView | null | undefined;
      if (!job) return 1500;
      return ACTIVE.has(job.status) ? 1500 : false;
    },
    retry: 3,
  });

  // Out-of-order protection: never move backwards for the same job and dispatch.
  const job = useMemo(() => {
    const next = (jobQuery.data ?? null) as FlowJob | null;
    accepted.current = acceptJobSnapshot(accepted.current, next);
    return accepted.current as (FlowJob & DemoJobView) | null;
  }, [jobQuery.data]);

  const needsIdentity =
    Boolean(job?.matchId) && (job?.status === "processed" || job?.status === "failed");
  const identityQuery = useQuery({
    queryKey: ["pipeline", "identity", jobId],
    queryFn: () => getDemoIdentity({ data: { jobId: jobId as string } }),
    enabled: open && Boolean(jobId) && needsIdentity,
  });

  const identityState = needsIdentity
    ? deriveIdentityUiState(identityQuery.data, {
        loading: identityQuery.isLoading,
        error: identityQuery.isError,
        manualMode,
      })
    : null;

  const phase = deriveDemoFlowPhase({
    upload,
    job,
    identity: identityState,
    uploadInterrupted: Boolean(interrupted) && !upload && !jobId,
  });

  const refreshJob = async () => {
    // A user action legitimately moves the job back to the queue (same job, new dispatch).
    accepted.current = null;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pipeline", "submission", jobId] }),
      queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["pipeline", "identity", jobId] }),
    ]);
  };

  const declare = useMutation({
    mutationFn: (participantKey: string) =>
      declareDemoPlayer({ data: { jobId: jobId as string, participantKey } }),
    onMutate: () => setIdentityError(null),
    onSuccess: async (result) => {
      if (result.state !== "attached") {
        setIdentityError(
          result.state === "conflict" ? "pipeline.identify.conflict" : "pipeline.identify.notFound",
        );
      }
      await refreshJob();
    },
    onError: (error) => setIdentityError(identityErrorKey(error)),
  });

  const decision = useMutation({
    mutationFn: (action: "confirm" | "reject") =>
      decideAutomaticDemoPlayer({ data: { jobId: jobId as string, action } }),
    onMutate: () => setIdentityError(null),
    onSuccess: async (value) => {
      if (value.action === "reject") setManualMode(true);
      await refreshJob();
    },
    onError: (error) => setIdentityError(identityErrorKey(error)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelMyDemoJob({ data: { jobId: jobId as string } }),
    onSuccess: async () => {
      setCancelAsking(false);
      await refreshJob();
    },
  });

  // Same rule as the card's retry button: the server validates the retry budget again.
  const retry = useMutation({
    mutationFn: () => retryMyDemoJob({ data: { jobId: jobId as string } }),
    onSuccess: async () => {
      await refreshJob();
    },
  });

  // One classifier for the modal and the card: a stopped job shows the same guidance.
  const guidance =
    job &&
    (phase.kind === "blocked_raw_audit" ||
      phase.kind === "unknown" ||
      (phase.kind === "failed" && phase.action !== "select_and_retry"))
      ? classifyDemoJob(job)
      : null;
  const stoppedGuidance = guidance && STOPPED_GUIDANCE.has(guidance.category) ? guidance : null;

  const locked = open && isLockedPhase(phase);

  // Navigation lock at router level (links, back button, programmatic navigation); the
  // browser warns on unload only while the browser itself is sending the file.
  useBlocker({
    shouldBlockFn: () => locked,
    enableBeforeUnload: () => open && warnBeforeUnload(phase),
    disabled: !locked,
  });

  useInertBackground(open && locked, contentRef);

  // Completion: shown, then closed after a short delay (the button stays available).
  useEffect(() => {
    if (!open || phase.kind !== "completed") {
      setCountdown(null);
      return;
    }
    setCountdown(AUTO_CLOSE_SECONDS);
    const timer = window.setInterval(() => {
      setCountdown((value) => (value == null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, phase.kind]);

  useEffect(() => {
    if (countdown === 0 && phase.kind === "completed") onDismiss("completed", jobId);
  }, [countdown, phase.kind, jobId, onDismiss]);

  const participants = identityQuery.data?.participants ?? [];
  const nickname =
    phase.kind === "confirm_automatic"
      ? (identityQuery.data?.observedNickname ?? null)
      : (job?.observedNickname ?? identityQuery.data?.observedNickname ?? null);

  const fileName = upload?.fileName ?? job?.fileName ?? interrupted?.fileName ?? null;
  const fileSize = upload?.fileSize ?? interrupted?.fileSize ?? null;

  const errorKey: TranslationKey | null =
    phase.kind === "upload_failed"
      ? errorKeyFor(phase.code)
      : phase.kind === "failed"
        ? errorKeyFor(phase.code)
        : phase.kind === "identity_error"
          ? "demoFlow.identify.loadError"
          : null;

  return (
    <DialogPrimitive.Root open={open} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none supports-[not(backdrop-filter:blur(4px))]:bg-background/90"
          data-testid="demo-flow-overlay"
        />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby="demo-flow-description"
          aria-modal="true"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            // Escape never interrupts a critical step; it only closes a settled state.
            if (!locked) onDismiss(phase.kind === "completed" ? "completed" : "closed", jobId);
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            const target = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocus.current;
            if (target && document.contains(target)) {
              event.preventDefault();
              target.focus();
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl shadow-black/40 ring-1 ring-primary/10 backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="sr-only">
            {t("demoFlow.dialogLabel")}
          </DialogPrimitive.Title>
          <div
            className="h-1 w-full bg-gradient-to-r from-primary/0 via-primary/70 to-primary/0"
            aria-hidden
          />
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7">
            <DemoFlowView
              phase={phase}
              fileName={fileName}
              fileSize={fileSize}
              errorKey={errorKey}
              stageKey={stageKeyFor(phase)}
              nickname={nickname}
              map={job?.map ?? null}
              offline={offline || (jobQuery.isError && Boolean(jobId))}
              resumed={resumed}
              participants={participants}
              suggestedKey={identityQuery.data?.suggestion?.participantKey ?? null}
              selectedKey={selected}
              onSelect={(key) => {
                // Only a key that the server returned for THIS demo can be chosen.
                if (participants.some((p) => p.participantKey === key)) setSelected(key);
              }}
              onConfirmSelection={() => {
                if (selected && participants.some((p) => p.participantKey === selected)) {
                  declare.mutate(selected);
                }
              }}
              identityBusy={declare.isPending || decision.isPending}
              identityErrorKey={identityError}
              onConfirmAutomatic={() => decision.mutate("confirm")}
              onRejectAutomatic={() => decision.mutate("reject")}
              onReloadIdentity={() => void identityQuery.refetch()}
              onDecideLater={() => onDismiss("later", jobId)}
              cancelAvailable={canCancel(job) && !cancel.isPending}
              cancelAsking={cancelAsking}
              cancelBusy={cancel.isPending}
              cancelFailed={cancel.isError}
              onAskCancel={() => setCancelAsking(true)}
              onConfirmCancel={() => cancel.mutate()}
              onKeepGoing={() => setCancelAsking(false)}
              onBackground={() => onDismiss("background", jobId)}
              onClose={() => onDismiss("closed", jobId)}
              onChooseFileAgain={onChooseFileAgain}
              onViewAnalysis={onViewAnalysis}
              autoCloseSeconds={countdown}
              guidance={stoppedGuidance}
              reportJobId={stoppedGuidance ? jobId : null}
              onRetry={() => retry.mutate()}
              retryBusy={retry.isPending}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
