/**
 * Real profile-photo management: the only feature in the product that writes
 * to Storage. Everything else remains demo data.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { ChartCard } from "@/components/common/ChartCard";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { useT, type TranslationKey } from "@/i18n";
import { AVATAR_ACCEPTED_TYPES, removeAvatar, uploadAvatar } from "@/lib/avatar";

function errorKeyFor(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message : "";
  if (message === "AVATAR_TYPE") return "avatar.error.type";
  if (message === "AVATAR_TOO_LARGE") return "avatar.error.tooLarge";
  return "avatar.error.failed";
}

export function AvatarCard({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: account } = useAccount();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; key: TranslationKey } | null>(
    null,
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["account"] });
    void queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!account) throw new Error("AVATAR_FAILED");
      return uploadAvatar(account.id, file);
    },
    onSuccess: () => {
      setFeedback({ kind: "ok", key: "avatar.updated" });
      refresh();
    },
    onError: (error) => setFeedback({ kind: "error", key: errorKeyFor(error) }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("AVATAR_FAILED");
      return removeAvatar(account.id);
    },
    onSuccess: () => {
      setFeedback({ kind: "ok", key: "avatar.removed" });
      refresh();
    },
    onError: (error) => setFeedback({ kind: "error", key: errorKeyFor(error) }),
  });

  const busy = upload.isPending || remove.isPending;
  const hasAvatar = Boolean(account?.avatar_url);

  const body = (
    <div className="space-y-3">
      {embedded ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {t("avatar.title")}
        </p>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <UserAvatar
          source={account?.avatar_url ?? null}
          name={account?.display_name ?? account?.nickname ?? null}
          size={embedded ? 72 : 88}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("avatar.description")}</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={AVATAR_ACCEPTED_TYPES.join(",")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                setFeedback(null);
                upload.mutate(file);
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !account} onClick={() => inputRef.current?.click()}>
              {upload.isPending
                ? t("avatar.uploading")
                : hasAvatar
                  ? t("avatar.replace")
                  : t("avatar.upload")}
            </Button>
            {hasAvatar ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => remove.mutate()}>
                {t("avatar.remove")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("avatar.fallbackHint")}</span>
            )}
          </div>
          {feedback ? (
            <p
              className={
                feedback.kind === "ok" ? "text-sm text-primary" : "text-sm text-destructive"
              }
            >
              {t(feedback.key)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <ChartCard title={t("avatar.title")} showDemoTag={false}>
      {body}
    </ChartCard>
  );
}
