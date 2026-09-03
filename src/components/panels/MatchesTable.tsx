import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT, type TranslationKey } from "@/i18n";
import type { MatchRow } from "@/types";
import { cn } from "@/lib/utils";

const resultTone = {
  V: "text-success",
  D: "text-destructive",
  E: "text-muted-foreground",
} as const;

const resultKey: Record<MatchRow["result"], TranslationKey> = {
  V: "matches.result.win",
  D: "matches.result.loss",
  E: "matches.result.draw",
};

const columnKeys: TranslationKey[] = [
  "matches.col.date",
  "matches.col.platform",
  "matches.col.map",
  "matches.col.result",
  "matches.col.kills",
  "matches.col.deaths",
  "matches.col.adr",
  "matches.col.kast",
  "matches.col.rating",
];

function formatDate(iso: string) {
  const [y = "", m = "", d = ""] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function MatchesTable({ rows }: { rows: MatchRow[] }) {
  const t = useT();

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columnKeys.map((key) => (
              <TableHead
                key={key}
                className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {t(key)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border">
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {formatDate(row.date)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{row.platform}</TableCell>
              <TableCell className="whitespace-nowrap text-sm font-medium">{row.map}</TableCell>
              <TableCell className="whitespace-nowrap">
                <span className={cn("text-sm font-semibold", resultTone[row.result])}>
                  {t(resultKey[row.result])}
                </span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{row.score}</span>
              </TableCell>
              <TableCell className="num-display text-sm">{row.kills}</TableCell>
              <TableCell className="num-display text-sm text-muted-foreground">
                {row.deaths}
              </TableCell>
              <TableCell className="num-display text-sm">{row.adr.toFixed(1)}</TableCell>
              <TableCell className="num-display text-sm">{row.kast}%</TableCell>
              <TableCell
                className={cn(
                  "num-display text-sm font-semibold",
                  row.rating >= 1.1
                    ? "text-success"
                    : row.rating >= 0.95
                      ? "text-foreground"
                      : "text-destructive",
                )}
              >
                {row.rating.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
