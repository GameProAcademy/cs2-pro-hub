/**
 * PM5 module I — "Save moment" dialog. Used from the replay (current tick) and from the round
 * review timeline (event tick). The server validates ownership and the range; this form only
 * collects the player's own words.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT, type TranslationKey } from "@/i18n";
import { createMoment } from "@/lib/moments.functions";
import { MOMENT_KINDS, type MomentKind, type MomentSource } from "@/lib/moments/moments";

export function SaveMomentButton({
  matchId,
  round,
  tick,
  kind = "TICK_RANGE",
  eventRef,
  source,
  defaultTitle,
  compact = false,
}: {
  matchId: string;
  round: number;
  tick: number;
  kind?: MomentKind;
  eventRef?: string | undefined;
  source: MomentSource;
  defaultTitle: string;
  compact?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [chosenKind, setKind] = useState<MomentKind>(kind);
  const mutation = useMutation({
    mutationFn: () =>
      createMoment({
        data: {
          matchId,
          round,
          tickStart: tick,
          kind: chosenKind,
          title: title.trim(),
          note,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          source,
          ...(eventRef ? { eventRef } : {}),
        },
      }),
    onSuccess: (r) => {
      if (r.status === "OK") {
        void qc.invalidateQueries({ queryKey: ["player", "moments"] });
        setOpen(false);
      }
    },
  });
  const status = mutation.data?.status;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          mutation.reset();
          setTitle(defaultTitle);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 px-2 text-xs" : ""}
          data-save-moment
        >
          <BookmarkPlus className="size-4" aria-hidden />
          {t("moments.save")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("moments.save.title")}</DialogTitle>
          <DialogDescription>{t("moments.save.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) mutation.mutate();
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{t("moments.field.title")}</span>
            <Input
              value={title}
              maxLength={120}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("moments.field.kind")}</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={chosenKind}
              onChange={(e) => setKind(e.target.value as MomentKind)}
            >
              {MOMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`moments.kind.${k}` as TranslationKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("moments.field.note")}</span>
            <Textarea
              value={note}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("moments.field.tags")}</span>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("moments.field.tagsHint")}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("moments.save.private")}</p>
          {status && status !== "OK" ? (
            <p role="alert" className="text-sm text-destructive" data-moment-error={status}>
              {t(`moments.error.${status}` as TranslationKey)}
            </p>
          ) : mutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("real.error.description")}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !title.trim()}>
              {t("moments.save.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
