/**
 * Upload modal — content only (no data fetching, no navigation, no dialog wrapper), so every
 * phase can be rendered and checked in tests. The container (DemoFlowModal) owns the
 * queries, the mutations and the navigation lock; this view only shows what it is given.
 */
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Circle,
  FileArchive,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n/config";
import {
  FLOW_STEPS,
  canContinueInBackground,
  stepStates,
  uploadPercent,
  type DemoFlowPhase,
  type FlowStep,
} from "@/lib/pipeline/demoFlow";
import { cn } from "@/lib/utils";

import { formatBytes, phaseCopy } from "./demoFlowCopy";

export interface FlowParticipant {
  participantKey: string;
  nickname: string | null;
  team: string | null;
}

export interface DemoFlowViewProps {
  phase: DemoFlowPhase;
  fileName: string | null;
  fileSize: number | null;
  /** Error copy for upload/processing failures (already mapped to a known key). */
  errorKey: TranslationKey | null;
  /** Processing stage copy from the existing card vocabulary. */
  stageKey: TranslationKey | null;
  nickname: string | null;
  map: string | null;
  offline: boolean;
  resumed: boolean;
  // identity
  participants: FlowParticipant[];
  suggestedKey: string | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onConfirmSelection: () => void;
  identityBusy: boolean;
  identityErrorKey: TranslationKey | null;
  onConfirmAutomatic: () => void;
  onRejectAutomatic: () => void;
  onReloadIdentity: () => void;
  onDecideLater: () => void;
  // cancel / background / close
  cancelAvailable: boolean;
  cancelAsking: boolean;
  cancelBusy: boolean;
  cancelFailed: boolean;
  onAskCancel: () => void;
  onConfirmCancel: () => void;
  onKeepGoing: () => void;
  onBackground: () => void;
  onClose: () => void;
  onChooseFileAgain: () => void;
  onViewAnalysis: () => void;
  autoCloseSeconds: number | null;
}

const STEP_LABEL: Record<FlowStep, TranslationKey> = {
  upload: "demoFlow.step.upload",
  validate: "demoFlow.step.validate",
  read: "demoFlow.step.read",
  metrics: "demoFlow.step.metrics",
  identify: "demoFlow.step.identify",
  done: "demoFlow.step.done",
};

function PhaseIcon({ phase }: { phase: DemoFlowPhase }) {
  const base = "size-5";
  switch (phase.kind) {
    case "completed":
      return <CheckCircle2 className={cn(base, "text-primary")} aria-hidden />;
    case "upload_failed":
    case "failed":
    case "identity_error":
    case "unknown":
      return <AlertCircle className={cn(base, "text-destructive")} aria-hidden />;
    case "blocked_raw_audit":
    case "needs_card_action":
    case "upload_interrupted":
      return <ShieldAlert className={cn(base, "text-warning")} aria-hidden />;
    case "cancelled":
      return <Ban className={cn(base, "text-warning")} aria-hidden />;
    case "confirm_automatic":
      return <ShieldCheck className={cn(base, "text-primary")} aria-hidden />;
    // Waiting for the player, not for the server: no spinner.
    case "select_player":
      return <UserRound className={cn(base, "text-primary")} aria-hidden />;
    default:
      return (
        <Loader2
          className={cn(base, "animate-spin text-primary motion-reduce:animate-none")}
          aria-hidden
        />
      );
  }
}

function Steps({ phase }: { phase: DemoFlowPhase }) {
  const t = useT();
  const states = stepStates(phase);
  return (
    <ol
      aria-label={t("demoFlow.steps.label")}
      className="grid grid-cols-3 gap-x-2 gap-y-2.5 sm:grid-cols-6"
    >
      {FLOW_STEPS.map((step) => {
        const state = states[step];
        return (
          <li
            key={step}
            data-step={step}
            data-state={state}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-[11px]",
                state === "done" && "border-primary/50 bg-primary/15 text-primary",
                state === "active" && "border-primary bg-primary/10 text-primary",
                state === "pending" && "border-border/80 bg-background/30 text-muted-foreground",
                state === "error" && "border-destructive/60 bg-destructive/10 text-destructive",
              )}
              aria-hidden
            >
              {state === "done" ? (
                <Check className="size-3.5" />
              ) : state === "active" ? (
                <span className="relative flex size-3 items-center justify-center">
                  <span className="absolute size-3 animate-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
                  <Circle className="relative size-2.5 fill-primary text-primary" />
                </span>
              ) : state === "error" ? (
                <AlertCircle className="size-3.5" />
              ) : (
                <Circle className="size-2.5" />
              )}
            </span>
            <span
              className={cn(
                "w-full break-words text-[10px] leading-tight sm:text-[11px]",
                state === "active" ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {t(STEP_LABEL[step])}
              <span className="sr-only"> — {t(`demoFlow.state.${state}` as TranslationKey)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UploadProgress({ phase }: { phase: Extract<DemoFlowPhase, { kind: "uploading" }> }) {
  const t = useT();
  const percent = uploadPercent(phase);
  const label: TranslationKey =
    phase.sub === "hashing"
      ? "demoFlow.upload.hashing"
      : phase.sub === "registering"
        ? "demoFlow.upload.registering"
        : "demoFlow.upload.uploading";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{t(label)}</span>
        {percent != null ? (
          <span className="font-mono font-semibold tabular-nums text-foreground">{percent}%</span>
        ) : null}
      </div>
      {percent != null ? (
        <div
          role="progressbar"
          aria-label={t(label)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        // No measurable share yet: an indeterminate bar, never an invented percentage.
        <div
          role="progressbar"
          aria-label={t(label)}
          aria-busy="true"
          data-indeterminate="true"
          className="relative h-2 overflow-hidden rounded-full bg-secondary"
        >
          <div className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" />
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("demoFlow.upload.keepOpen")}
      </p>
    </div>
  );
}

function hasFooterActions(phase: DemoFlowPhase, cancelShown: boolean): boolean {
  return (
    cancelShown ||
    canContinueInBackground(phase) ||
    [
      "upload_failed",
      "upload_interrupted",
      "needs_card_action",
      "blocked_raw_audit",
      "cancelled",
      "unknown",
      "identity_error",
      "completed",
    ].includes(phase.kind) ||
    (phase.kind === "failed" && phase.action !== "select_and_retry")
  );
}

export function DemoFlowView(props: DemoFlowViewProps) {
  const t = useT();
  const { phase } = props;
  const copy = phaseCopy(phase);
  const size = formatBytes(props.fileSize);
  const body = t(copy.body).replace("{file}", props.fileName ?? "");
  const isError =
    phase.kind === "upload_failed" ||
    phase.kind === "failed" ||
    phase.kind === "identity_error" ||
    phase.kind === "unknown";

  return (
    <div className="flex min-h-0 flex-col gap-5" data-phase={phase.kind}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <PhaseIcon phase={phase} />
        </span>
        <div className="min-w-0">
          <h2
            id="demo-flow-title"
            className="font-display text-base font-semibold uppercase tracking-[0.12em] text-foreground sm:text-lg"
          >
            {t(copy.title)}
          </h2>
          <p
            id="demo-flow-description"
            className="mt-1 text-sm leading-relaxed text-muted-foreground"
          >
            {body}
          </p>
        </div>
      </div>

      <Steps phase={phase} />

      {props.fileName ? (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
          <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="sr-only">{t("demoFlow.file")}</p>
            <p className="truncate text-sm font-medium text-foreground" title={props.fileName}>
              {props.fileName}
            </p>
          </div>
          {size ? (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              <span className="sr-only">{t("demoFlow.size")} </span>
              {size}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Live region: the current state is announced to screen readers. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(copy.title)}
      </p>

      {props.offline ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning/35 bg-warning/8 px-3 py-2.5 text-xs text-warning"
        >
          <WifiOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("demoFlow.reconnecting")}
        </p>
      ) : props.resumed ? (
        <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          {t("demoFlow.resumed")}
        </p>
      ) : null}

      {phase.kind === "uploading" ? <UploadProgress phase={phase} /> : null}

      {(phase.kind === "waiting_job" ||
        phase.kind === "queued" ||
        phase.kind === "processing" ||
        phase.kind === "attaching" ||
        phase.kind === "identity_loading") &&
      props.stageKey ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            {t(props.stageKey)}
          </p>
          {/* Server stages are not individually measurable: an activity bar, no percentage. */}
          <div
            role="progressbar"
            aria-label={t(props.stageKey)}
            aria-busy="true"
            data-indeterminate="true"
            className="relative h-1.5 overflow-hidden rounded-full bg-secondary"
          >
            <div className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" />
          </div>
        </div>
      ) : null}

      {isError && props.errorKey ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
        >
          {t(props.errorKey)}
        </p>
      ) : null}

      {phase.kind === "identity_error" ? (
        <Button variant="outline" className="min-h-11" onClick={props.onReloadIdentity}>
          {t("demoFlow.identify.reload")}
        </Button>
      ) : null}

      {phase.kind === "confirm_automatic" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-primary/35 bg-primary/8 p-3">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="break-words font-semibold text-foreground">
                {props.nickname ?? t("pipeline.history.unavailable")}
              </p>
              <p className="text-xs text-muted-foreground">{t("pipeline.identify.steamMatch")}</p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={props.identityBusy}
              onClick={props.onRejectAutomatic}
            >
              {t("pipeline.identify.notMe")}
            </Button>
            <Button
              className="min-h-11"
              disabled={props.identityBusy}
              onClick={props.onConfirmAutomatic}
            >
              {props.identityBusy ? (
                <Loader2
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {t("demoFlow.identify.confirmAutomatic")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "select_player" ||
      (phase.kind === "failed" && phase.action === "select_and_retry") ? (
        props.participants.length > 0 ? (
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("pipeline.identify.selectLabel")}
            </legend>
            <div className="grid max-h-[38vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {props.participants.map((participant) => {
                const checked = props.selectedKey === participant.participantKey;
                return (
                  <label
                    key={participant.participantKey}
                    className={cn(
                      "flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                      checked
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-background/40 hover:border-primary/30",
                    )}
                  >
                    <input
                      type="radio"
                      name="demo-flow-player"
                      value={participant.participantKey}
                      checked={checked}
                      onChange={() => props.onSelect(participant.participantKey)}
                      disabled={props.identityBusy}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-foreground">
                        {participant.nickname ?? participant.participantKey}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {participant.team
                          ? `${t("demoFlow.select.team")}: ${participant.team}`
                          : null}
                        {props.suggestedKey === participant.participantKey ? (
                          <span className="ml-1 text-primary">
                            {participant.team ? "· " : ""}
                            {t("demoFlow.select.suggested")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {!props.selectedKey ? (
              <p className="text-xs text-muted-foreground">{t("demoFlow.select.required")}</p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={props.identityBusy}
                onClick={props.onDecideLater}
              >
                {t("demoFlow.select.later")}
              </Button>
              <Button
                className="min-h-11"
                disabled={!props.selectedKey || props.identityBusy}
                onClick={props.onConfirmSelection}
              >
                {props.identityBusy ? (
                  <Loader2
                    className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : null}
                {t("demoFlow.select.cta")}
              </Button>
            </div>
          </fieldset>
        ) : (
          <p className="rounded-md border border-border bg-background/40 px-3 py-2.5 text-xs text-muted-foreground">
            {t("pipeline.identify.empty")}
          </p>
        )
      ) : null}

      {props.identityErrorKey ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive"
        >
          {t(props.identityErrorKey)}
        </p>
      ) : null}

      {phase.kind === "completed" ? (
        <dl className="grid grid-cols-1 gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("demoFlow.done.player")}
            </dt>
            <dd className="break-words font-semibold text-foreground">
              {props.nickname ?? t("pipeline.history.unavailable")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("demoFlow.done.map")}
            </dt>
            <dd className="break-words font-semibold text-foreground">
              {props.map ?? t("pipeline.history.unavailable")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("demoFlow.done.status")}
            </dt>
            <dd className="font-semibold text-primary">{t("demoFlow.done.statusValue")}</dd>
          </div>
        </dl>
      ) : null}

      {/* Actions */}
      {props.cancelAsking ? (
        <div
          role="group"
          className="space-y-3 rounded-lg border border-warning/35 bg-warning/8 p-3"
        >
          <p className="text-sm text-foreground">{t("demoFlow.cancelQuestion")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="min-h-11" onClick={props.onKeepGoing}>
              {t("demoFlow.cancelKeep")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={props.cancelBusy}
              onClick={props.onConfirmCancel}
            >
              {props.cancelBusy ? (
                <Loader2
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {t("demoFlow.cancelConfirm")}
            </Button>
          </div>
        </div>
      ) : null}
      {props.cancelFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {t("demoFlow.cancelError")}
        </p>
      ) : null}

      {hasFooterActions(phase, props.cancelAvailable && !props.cancelAsking) ? (
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {props.cancelAvailable && !props.cancelAsking ? (
            <Button variant="ghost" className="min-h-11 sm:mr-auto" onClick={props.onAskCancel}>
              {t("demoFlow.cancel")}
            </Button>
          ) : null}
          {canContinueInBackground(phase) ? (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={props.onBackground}
              title={t("demoFlow.backgroundHint")}
            >
              {t("demoFlow.background")}
            </Button>
          ) : null}
          {phase.kind === "upload_failed" || phase.kind === "upload_interrupted" ? (
            <>
              <Button variant="outline" className="min-h-11" onClick={props.onClose}>
                {t("demoFlow.close")}
              </Button>
              <Button className="min-h-11" onClick={props.onChooseFileAgain}>
                {t("demoFlow.upload.tryAgain")}
              </Button>
            </>
          ) : null}
          {phase.kind === "failed" && phase.action !== "select_and_retry" ? (
            <Button className="min-h-11" onClick={props.onClose}>
              {t("demoFlow.close")}
            </Button>
          ) : null}
          {phase.kind === "needs_card_action" ||
          phase.kind === "blocked_raw_audit" ||
          phase.kind === "cancelled" ||
          phase.kind === "unknown" ||
          phase.kind === "identity_error" ? (
            <Button
              className="min-h-11"
              variant={phase.kind === "identity_error" ? "ghost" : "default"}
              onClick={props.onClose}
            >
              {t("demoFlow.close")}
            </Button>
          ) : null}
          {phase.kind === "completed" ? (
            <>
              <Button variant="outline" className="min-h-11" onClick={props.onClose}>
                {t("demoFlow.done.close")}
              </Button>
              <Button className="min-h-11" onClick={props.onViewAnalysis} data-autofocus="true">
                {t("demoFlow.done.cta")}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {phase.kind === "completed" && props.autoCloseSeconds != null ? (
        <p className="-mt-3 text-right text-[11px] text-muted-foreground" aria-live="off">
          {t("demoFlow.done.autoClose").replace("{seconds}", String(props.autoCloseSeconds))}
        </p>
      ) : null}
      {canContinueInBackground(phase) ? (
        <p className="-mt-3 text-[11px] leading-relaxed text-muted-foreground sm:text-right">
          {t("demoFlow.backgroundHint")}
        </p>
      ) : null}
    </div>
  );
}
