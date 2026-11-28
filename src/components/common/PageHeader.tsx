import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleAddon,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
  /** VGL 5.1: a small control right after the title (e.g. an explanatory InfoTip). */
  titleAddon?: ReactNode;
}) {
  return (
    <header className="relative isolate flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      {/* VGL 2.0: tactical backdrop (radar paper + reticle). Absolute and decorative: the header
          keeps exactly its previous box, so no page layout moves. */}
      <span
        aria-hidden
        className="vgl-grid pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(90deg,transparent,black_35%,black_70%,transparent)] opacity-70"
      />
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="pointer-events-none absolute bottom-3 right-2 -z-10 hidden h-24 w-24 text-primary/20 sm:block"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="60" cy="60" r="44" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="24" strokeWidth="1.5" strokeDasharray="4 6" />
        <path d="M60 4v26M60 90v26M4 60h26M90 60h26" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span aria-hidden className="absolute -bottom-px left-0 h-0.5 w-24 bg-primary" />
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold uppercase tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {titleAddon}
        </div>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
