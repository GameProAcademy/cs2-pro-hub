import type { ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { APP_TAGLINE } from "@/config/app";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Brand />
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {APP_TAGLINE}
          </p>
        </div>

        <div className="surface-panel rounded-xl border border-border p-6 sm:p-8">
          <h1 className="text-xl font-semibold uppercase tracking-tight text-foreground">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}
