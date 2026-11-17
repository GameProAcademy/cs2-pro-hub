/**
 * PM3 — observability for server functions: per-stage durations as a `Server-Timing` response
 * header (readable in the browser's Resource Timing, `serverTiming`), so latency can be attributed
 * to a stage with evidence before anything is optimised. Stage names and milliseconds only: no
 * identifier, no payload. Emitting the header can never fail the request.
 */
import { setResponseHeader } from "@tanstack/react-start/server";

export interface StageTimer {
  /** Closes the current stage under `name` (duration since the previous mark). */
  mark: (name: string) => void;
  /** `name;dur=12.3, …, handler;dur=…` */
  header: () => string;
  /** Sends the header (best effort). */
  emit: () => void;
}

const SAFE_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export function stageTimer(now: () => number = () => performance.now()): StageTimer {
  const start = now();
  let last = start;
  const stages: Array<[string, number]> = [];
  const header = () =>
    [...stages, ["handler", last - start] as [string, number]]
      .map(([n, d]) => `${n};dur=${Math.max(0, d).toFixed(1)}`)
      .join(", ");
  return {
    mark(name) {
      if (!SAFE_NAME.test(name)) return;
      const t = now();
      stages.push([name, t - last]);
      last = t;
    },
    header,
    emit() {
      try {
        setResponseHeader("Server-Timing", header());
      } catch {
        // Observability only: never fail the request because a header could not be set.
      }
    },
  };
}
