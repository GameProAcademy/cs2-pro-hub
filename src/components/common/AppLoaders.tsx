import { Loader2 } from "lucide-react";

import gameproSymbol from "@/assets/gamepro-symbol.png";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";

export function InitialAppLoader() {
  const t = useT();

  return (
    <div
      className="grid min-h-screen place-items-center overflow-hidden bg-background px-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-lg border border-primary/30 bg-elevated shadow-[var(--shadow-glow)]">
          <img
            src={gameproSymbol}
            alt="GamePro"
            width={42}
            height={42}
            className="size-10 object-contain"
          />
        </span>
        <p className="mt-5 font-display text-xl uppercase tracking-[0.14em] text-foreground">
          <span className="font-bold italic normal-case">GamePro</span> HUB
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{t("app.loading.initial")}</p>
        <Loader2
          className="mt-5 size-5 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function RouteTransitionBar({ active }: { active: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden"
      aria-hidden={!active}
    >
      <span
        className={`block h-full bg-primary transition-opacity motion-reduce:transition-none ${
          active ? "animate-route-progress opacity-100 motion-reduce:animate-none" : "opacity-0"
        }`}
      />
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((item) => (
        <div key={item} className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-2/3 max-w-64" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="mt-4 h-2 w-full" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-3" aria-hidden>
      <div className="space-y-5 rounded-lg border border-border p-5 lg:col-span-2">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    </div>
  );
}
