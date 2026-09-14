/**
 * FASE 2.7.2A — "WHO ARE YOU IN THIS DEMO?"
 *
 * Shown for an analysed match that is not linked to the user yet. The user
 * either picks one of the players the parser detected, or types the nickname
 * used in that match. Nothing is ever auto-picked from a similar nickname.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isParticipantConfirmationDisabled } from "@/components/pipeline/demoUploadFeedback";
import { useT } from "@/i18n";
import {
  declareDemoPlayer,
  getDemoIdentity,
  type DeclareResult,
  type DemoParticipantView,
} from "@/lib/pipeline-identity.functions";

export function DemoPlayerIdentity({ jobId }: { jobId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [result, setResult] = useState<DeclareResult | null>(null);

  const identity = useQuery({
    queryKey: ["pipeline", "identity", jobId],
    queryFn: () => getDemoIdentity({ data: { jobId } }),
  });

  const declare = useMutation({
    mutationFn: (input: { participantKey?: string; nickname?: string }) =>
      declareDemoPlayer({ data: { jobId, ...input } }),
    onSuccess: (declared) => {
      setResult(declared);
      queryClient.invalidateQueries({ queryKey: ["pipeline", "jobs"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline", "identity", jobId] });
    },
  });

  const participants: DemoParticipantView[] =
    result?.candidates && result.candidates.length > 0
      ? result.candidates
      : (identity.data?.participants ?? []);

  if (identity.isLoading) return null;

  return (
    <div className="mt-3 min-w-0 space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{t("pipeline.identify.title")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("pipeline.identify.help")}
        </p>
      </div>

      {participants.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("pipeline.identify.selectLabel")}
          </legend>
          {participants.map((participant) => (
            <label
              key={participant.participantKey}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                selected === participant.participantKey
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                  : "border-border bg-background/40 text-foreground hover:border-primary/30"
              }`}
            >
              <input
                type="radio"
                name={`demo-player-${jobId}`}
                value={participant.participantKey}
                checked={selected === participant.participantKey}
                onChange={() => setSelected(participant.participantKey)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block break-words font-medium">
                  {participant.nickname ?? participant.participantKey}
                </span>
                {participant.team ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {participant.team}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
          <Button
            size="sm"
            className="mt-2 min-h-11 w-full sm:w-auto"
            disabled={isParticipantConfirmationDisabled(selected, declare.isPending)}
            onClick={() => selected && declare.mutate({ participantKey: selected })}
          >
            {t("pipeline.identify.selectCta")}
          </Button>
        </fieldset>
      ) : (
        <p className="rounded-md border border-border bg-background/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t("pipeline.identify.empty")}
        </p>
      )}

      <div className="space-y-1.5">
        <label
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
          htmlFor={`nickname-${jobId}`}
        >
          {t("pipeline.identify.nicknameLabel")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`nickname-${jobId}`}
            value={nickname}
            maxLength={64}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={t("pipeline.identify.nicknamePlaceholder")}
            className="h-11 w-full sm:max-w-64"
          />
          <Button
            size="default"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={nickname.trim().length === 0 || declare.isPending}
            onClick={() => declare.mutate({ nickname: nickname.trim() })}
          >
            {t("pipeline.identify.nicknameCta")}
          </Button>
        </div>
      </div>

      {declare.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("common.loading")}
        </p>
      ) : null}

      {result ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${
            result.state === "attached"
              ? "border-success/30 bg-success/8 text-xs text-success"
              : result.state === "conflict"
                ? "border-destructive/30 bg-destructive/8 text-xs text-destructive"
                : "border-warning/30 bg-warning/8 text-xs text-warning"
          }`}
        >
          {result.state === "attached" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : null}
          {result.state === "attached"
            ? t("pipeline.identify.reprocessing")
            : result.state === "conflict"
              ? t("pipeline.identify.conflict")
              : result.reason === "ambiguous_nickname"
                ? t("pipeline.identify.ambiguous")
                : t("pipeline.identify.notFound")}
        </p>
      ) : null}
    </div>
  );
}
