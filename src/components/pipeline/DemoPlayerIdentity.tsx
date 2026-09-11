/**
 * FASE 2.7.2A — "WHO ARE YOU IN THIS DEMO?"
 *
 * Shown for an analysed match that is not linked to the user yet. The user
 * either picks one of the players the parser detected, or types the nickname
 * used in that match. Nothing is ever auto-picked from a similar nickname.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="mt-2 space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t("pipeline.identify.title")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("pipeline.identify.help")}
        </p>
      </div>

      {participants.length > 0 ? (
        <fieldset className="space-y-1.5">
          <legend className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("pipeline.identify.selectLabel")}
          </legend>
          {participants.map((participant) => (
            <label
              key={participant.participantKey}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name={`demo-player-${jobId}`}
                value={participant.participantKey}
                checked={selected === participant.participantKey}
                onChange={() => setSelected(participant.participantKey)}
              />
              <span className="truncate">
                {participant.nickname ?? participant.participantKey}
                {participant.team ? (
                  <span className="text-muted-foreground"> · {participant.team}</span>
                ) : null}
              </span>
            </label>
          ))}
          <Button
            size="sm"
            className="mt-1.5"
            disabled={!selected || declare.isPending}
            onClick={() => selected && declare.mutate({ participantKey: selected })}
          >
            {t("pipeline.identify.selectCta")}
          </Button>
        </fieldset>
      ) : null}

      <div className="space-y-1.5">
        <label
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
          htmlFor={`nickname-${jobId}`}
        >
          {t("pipeline.identify.nicknameLabel")}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`nickname-${jobId}`}
            value={nickname}
            maxLength={64}
            onChange={(event) => setNickname(event.target.value)}
            className="h-9 max-w-56"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={nickname.trim().length === 0 || declare.isPending}
            onClick={() => declare.mutate({ nickname: nickname.trim() })}
          >
            {t("pipeline.identify.nicknameCta")}
          </Button>
        </div>
      </div>

      {declare.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("common.loading")}
        </p>
      ) : null}

      {result ? (
        <p
          role="status"
          className={
            result.state === "attached"
              ? "text-xs text-success"
              : result.state === "conflict"
                ? "text-xs text-destructive"
                : "text-xs text-warning"
          }
        >
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
