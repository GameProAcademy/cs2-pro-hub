import { Info } from "lucide-react";

import { DEMO_DATA } from "@/config/app";
import { cn } from "@/lib/utils";

/** Inline label attached to any surface rendering mock values. */
export function DemoTag({ className }: { className?: string }) {
  if (!DEMO_DATA) return null;
  return (
    <span
      className={cn(
        "rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-warning",
        className,
      )}
    >
      Demo
    </span>
  );
}

/** Page-level banner. Explicit: nothing here is real player data. */
export function DemoDataNotice({ context }: { context?: string }) {
  if (!DEMO_DATA) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/8 px-4 py-3">
      <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-warning">Dados de demonstração.</span>{" "}
        {context ??
          "Nenhuma demo foi processada. Os valores abaixo são fictícios e existem apenas para demonstrar a interface — não há parser, banco de dados ou IA conectados nesta etapa."}
      </p>
    </div>
  );
}
