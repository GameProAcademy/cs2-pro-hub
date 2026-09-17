import { History } from "lucide-react";

import { ChartCard } from "@/components/common/ChartCard";
import { useI18n, useT } from "@/i18n";
import type { PlayerNicknameHistoryRow } from "@/lib/profile.functions";

export function NicknameHistoryCard({ history }: { history: PlayerNicknameHistoryRow[] }) {
  const t = useT();
  const { intlTag } = useI18n();
  const format = (value: string) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(new Date(value));

  return (
    <ChartCard
      title={t("profile.nicknameHistory.title")}
      subtitle={t("profile.nicknameHistory.subtitle")}
      showDemoTag={false}
    >
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("profile.nicknameHistory.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {history.map((item) => (
            <li
              key={`${item.nickname}:${item.firstSeenAt}`}
              className="flex gap-3 py-3 first:pt-0 last:pb-0"
            >
              <History className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-foreground">{item.nickname}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("profile.nicknameHistory.period")
                    .replace("{first}", format(item.firstSeenAt))
                    .replace("{last}", format(item.lastSeenAt))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("profile.nicknameHistory.observations").replace(
                    "{count}",
                    String(item.timesSeen),
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
