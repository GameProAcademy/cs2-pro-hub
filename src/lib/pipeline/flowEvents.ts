/**
 * Structured client events for the demo flow (observability). Only an allow-listed set of
 * non-sensitive fields is ever emitted: ids, phase, category, code, stage, protocol,
 * outcome. Never a file, a token, an e-mail, a nickname or free text.
 */
export type DemoFlowEvent =
  | "modal_opened"
  | "upload_started"
  | "job_followed"
  | "players_available"
  | "player_selected"
  | "error_classified"
  | "report_created"
  | "report_email_sent"
  | "report_email_failed"
  | "analysis_done";

export interface DemoFlowEventFields {
  jobId?: string | null;
  phase?: string | null;
  category?: string | null;
  errorCode?: string | null;
  stage?: string | null;
  protocol?: string | null;
  outcome?: string | null;
}

const ALLOWED: (keyof DemoFlowEventFields)[] = [
  "jobId",
  "phase",
  "category",
  "errorCode",
  "stage",
  "protocol",
  "outcome",
];
const SAFE_VALUE = /^[A-Za-z0-9_.:-]{1,80}$/;

/** Builds the event record (pure, for tests). Unknown or unsafe values are dropped. */
export function demoFlowEventRecord(
  event: DemoFlowEvent,
  fields: DemoFlowEventFields = {},
): Record<string, string> {
  const record: Record<string, string> = { event };
  for (const key of ALLOWED) {
    const value = fields[key];
    if (typeof value === "string" && SAFE_VALUE.test(value)) record[key] = value;
  }
  return record;
}

export function emitDemoFlowEvent(event: DemoFlowEvent, fields: DemoFlowEventFields = {}): void {
  try {
    console.info(`[demo-flow] ${JSON.stringify(demoFlowEventRecord(event, fields))}`);
  } catch {
    // Observability never breaks the flow.
  }
}
