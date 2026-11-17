import { type FormEvent, type FormHTMLAttributes, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Form for credentials and other sensitive input on server-rendered pages.
 *
 * A plain `<form>` submitted before React hydrates (or with JavaScript disabled) is a native GET:
 * every named field — email, password — ends up in the URL, browser history, Referer and server/CDN
 * logs. This component closes that window in two layers:
 *
 * 1. Until hydration the whole form sits in a disabled `<fieldset>`: inputs and the submit button are
 *    disabled, so neither a click nor Enter (implicit submission) can submit natively.
 * 2. `method="post"` is defense in depth: should a native submission ever happen, fields travel in
 *    the request body, never in the URL.
 *
 * After hydration the submit is always handled by the app: `preventDefault()` runs first, before the
 * caller's handler, so even a handler that throws cannot fall back to a native submission.
 * `data-hydrated` exposes the state to tests (the E2E waits on `form[data-hydrated="true"]`).
 */
export function SafeForm({
  onSubmit,
  className,
  children,
  ...rest
}: Omit<FormHTMLAttributes<HTMLFormElement>, "method" | "action" | "onSubmit"> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <form
      {...rest}
      method="post"
      noValidate
      data-hydrated={hydrated ? "true" : "false"}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(event);
      }}
    >
      <fieldset disabled={!hydrated} className={cn("m-0 min-w-0 border-0 p-0", className)}>
        {children}
      </fieldset>
    </form>
  );
}
