/**
 * VGL 3.0 — "stacked table": below `md` each row becomes a small card and each cell shows its column
 * name from `data-label` (CSS only). Same markup, same values, no horizontal scroll on phones.
 * Literal class strings so Tailwind keeps them.
 */
export const STACK_TABLE = "max-md:block max-md:min-w-0";
export const STACK_HEAD = "max-md:sr-only";
export const STACK_BODY = "max-md:block max-md:space-y-3";
export const STACK_ROW =
  "max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-2 max-md:rounded-lg max-md:border max-md:border-border max-md:bg-background/40 max-md:p-3";
export const STACK_CELL =
  "max-md:p-0 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:font-mono max-md:before:text-xs max-md:before:font-normal max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]";
export const STACK_WIDE = "max-md:col-span-2";
