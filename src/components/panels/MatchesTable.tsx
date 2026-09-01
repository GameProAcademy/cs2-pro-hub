import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MatchRow } from "@/types";
import { cn } from "@/lib/utils";

const resultTone = {
  V: "text-success",
  D: "text-destructive",
  E: "text-muted-foreground",
} as const;

const resultLabel = { V: "Vitória", D: "Derrota", E: "Empate" } as const;

function formatDate(iso: string) {
  const [y = "", m = "", d = ""] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export function MatchesTable({ rows }: { rows: MatchRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {[
              "Data",
              "Plataforma",
              "Mapa",
              "Resultado",
              "Kills",
              "Deaths",
              "ADR",
              "KAST",
              "Rating",
            ].map((h) => (
              <TableHead
                key={h}
                className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {h}
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
                  {resultLabel[row.result]}
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
