import type { ReactNode } from "react";

import loginCover from "@/assets/login-cover.jpg";
import { LanguageSelector } from "@/components/common/LanguageSelector";
import { Brand } from "@/components/layout/Brand";
import { useT } from "@/i18n";

/**
 * Split premium auth layout: form card on one side, cover art on the other.
 * The language selector lives inside the card (top-right), never over the logo.
 */
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
  const t = useT();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Form side */}
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <div
          className="pointer-events-none absolute -top-40 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="relative w-full max-w-md">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-[var(--shadow-card)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <Brand />
              <LanguageSelector compact className="shrink-0" />
            </div>

            <div className="mt-7">
              <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>

            <div className="mt-6">{children}</div>
          </div>

          {footer ? <div className="mt-6 text-center text-sm">{footer}</div> : null}
        </div>
      </div>

      {/* Cover side */}
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src={loginCover}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-tr from-background via-background/70 to-transparent"
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-end p-10 xl:p-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-primary">
            GamePro
          </p>
          <p className="mt-3 max-w-lg text-balance font-display text-2xl font-bold uppercase leading-tight tracking-tight text-foreground">
            {t("brand.tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}
