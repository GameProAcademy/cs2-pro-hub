/**
 * /upload visual evolution — protection net for the flows the owner froze (2026-11-26):
 * file selection and upload, the upload modal, player identification and the processing steps.
 *
 * Three independent locks, all compared against `fixtures/uploadProtected.json`:
 *   1. files — git-blob SHA-1 of every protected component, library and copy namespace.
 *      Any byte changed in them fails here.
 *   2. keys  — every translation key those files can render, in the five locales.
 *      A protected message cannot be reworded through a dictionary edit.
 *   3. ssr   — server-rendered markup of the upload box, every modal phase and the
 *      processing steps. Catches a change that reaches them through a shared dependency.
 *
 * The fixture is regenerated ONLY with the owner's explicit authorization:
 *   UPDATE_UPLOAD_PROTECTION=1 npx vitest run src/lib/__tests__/uploadProtectedFlows.test.tsx
 * and the reason is recorded in docs/ux1/VISUAL_PHASE_VALIDATION.md.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UploadBox } from "@/components/common/UploadBox";
import { DemoFlowView, type DemoFlowViewProps } from "@/components/pipeline/DemoFlowView";
import { DemoProcessingStatus } from "@/components/pipeline/DemoProcessingStatus";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import type { DemoJobView } from "@/lib/pipeline.functions";
import type { DemoFlowPhase } from "@/lib/pipeline/demoFlow";

const root = process.cwd();
const FIXTURE = join(root, "src/lib/__tests__/fixtures/uploadProtected.json");
const UPDATE = process.env["UPDATE_UPLOAD_PROTECTION"] === "1";
const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];

/** Components of the frozen flows (selection, modal, identification, steps). */
const PROTECTED_COMPONENTS = [
  "src/components/common/UploadBox.tsx",
  "src/components/pipeline/DemoIngestPanel.tsx",
  "src/components/pipeline/DemoFlowModal.tsx",
  "src/components/pipeline/DemoFlowView.tsx",
  "src/components/pipeline/DemoPlayerIdentity.tsx",
  "src/components/pipeline/DemoProcessingStatus.tsx",
  "src/components/pipeline/DemoGuidancePanel.tsx",
  "src/components/pipeline/ReportProblem.tsx",
  "src/components/pipeline/demoFlowCopy.ts",
  "src/components/pipeline/demoUploadFeedback.ts",
  // Protected in this stage by the owner's decision, although technically separate.
  "src/components/integrations/PlayerIdentityPanel.tsx",
];

/** Logic and contracts those components run on. */
const PROTECTED_LIBRARIES = [
  "src/lib/pipeline/demoFlow.ts",
  "src/lib/pipeline/errorGuidance.ts",
  "src/lib/pipeline/flowEvents.ts",
  "src/lib/pipeline/client.ts",
  "src/lib/pipeline/processingProgress.ts",
  "src/lib/pipeline/identityRecovery.ts",
  "src/lib/pipeline/errors.ts",
  "src/lib/pipeline.functions.ts",
  "src/lib/pipeline-identity.functions.ts",
];

const PROTECTED_COPY = LOCALES.flatMap((l) => [
  `src/i18n/locales/demoFlow/${l}.ts`,
  `src/i18n/locales/guidance/${l}.ts`,
]);

const PROTECTED_FILES = [...PROTECTED_COMPONENTS, ...PROTECTED_LIBRARIES, ...PROTECTED_COPY];

/** Whole families rendered by the flows (namespaces and dynamic keys). */
const PROTECTED_PREFIXES = [
  "pipeline.",
  "demoFlow.",
  "guidance.",
  "report.",
  "pending.",
  "identity.",
  "analyze.demo.",
];

/**
 * Keys the owner authorized to change, with the date of the decision. The test still pins
 * their CURRENT value through the fixture; listing them here only documents why the
 * fixture entry differs from the 9d86fecf baseline.
 */
export const AUTHORIZED_CHANGES: Record<string, string> = {
  // The drop zone said the file was neither sent nor processed (copy from when the box was
  // visual-only); selecting the file starts the upload. Text only, owner decision 2026-11-26.
  "analyze.notSent": "2026-11-26",
  // Shown next to the file size after selection; said "ready to send (processing unavailable at
  // this stage)". Now "Demo enviada" and its translations. Text only, owner decision 2026-11-26.
  "analyze.ready": "2026-11-26",
};

const sha = (algo: "sha1" | "sha256", input: string | Buffer) =>
  createHash(algo).update(input).digest("hex");

/** Same identifier `git hash-object` prints. */
function gitBlob(path: string): string {
  const content = readFileSync(join(root, path));
  return sha("sha1", Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]));
}

function protectedKeys(): string[] {
  const dict = dictionaries["pt-BR"] as Record<string, string>;
  const all = Object.keys(dict);
  const keys = new Set<string>();
  const prefixes = new Set(PROTECTED_PREFIXES);
  for (const file of [...PROTECTED_COMPONENTS, ...PROTECTED_LIBRARIES]) {
    const source = readFileSync(join(root, file), "utf8");
    for (const m of source.matchAll(/["'`]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)["'`]/g)) {
      if (m[1] && m[1] in dict) keys.add(m[1]);
    }
    for (const m of source.matchAll(/`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*\.)\$\{/g)) {
      if (m[1]) prefixes.add(m[1]);
    }
  }
  for (const key of all) {
    if ([...prefixes].some((p) => key.startsWith(p))) keys.add(key);
  }
  return [...keys].sort();
}

const noop = () => undefined;

function flowProps(phase: DemoFlowPhase): DemoFlowViewProps {
  return {
    phase,
    fileName: "match.dem",
    fileSize: 150 * 1024 * 1024,
    errorKey: null,
    stageKey: "pipeline.processing.parsing.title",
    nickname: null,
    map: null,
    offline: false,
    resumed: false,
    participants: [
      { participantKey: "p1", nickname: "alpha", team: "CT" },
      { participantKey: "p2", nickname: "bravo", team: "T" },
    ],
    suggestedKey: "p1",
    selectedKey: null,
    onSelect: noop,
    onConfirmSelection: noop,
    identityBusy: false,
    identityErrorKey: null,
    onConfirmAutomatic: noop,
    onRejectAutomatic: noop,
    onReloadIdentity: noop,
    onDecideLater: noop,
    cancelAvailable: true,
    cancelAsking: false,
    cancelBusy: false,
    cancelFailed: false,
    onAskCancel: noop,
    onConfirmCancel: noop,
    onKeepGoing: noop,
    onBackground: noop,
    onClose: noop,
    onChooseFileAgain: noop,
    onViewAnalysis: noop,
    autoCloseSeconds: null,
  };
}

const FLOW_PHASES: Record<string, DemoFlowPhase> = {
  uploading_hashing: { kind: "uploading", sub: "hashing", percent: null },
  uploading: { kind: "uploading", sub: "uploading", percent: 37 },
  upload_failed: { kind: "upload_failed", code: "STORAGE_ERROR" },
  upload_interrupted: { kind: "upload_interrupted" },
  waiting_job: { kind: "waiting_job" },
  queued: { kind: "queued" },
  processing_validating: { kind: "processing", stage: "validating" },
  processing_parsing: { kind: "processing", stage: "parsing" },
  processing_metrics: { kind: "processing", stage: "metrics" },
  attaching: { kind: "attaching", stage: "queued" },
  identity_loading: { kind: "identity_loading" },
  identity_error: { kind: "identity_error" },
  confirm_automatic: { kind: "confirm_automatic" },
  select_player: { kind: "select_player", recover: false },
  select_player_recover: { kind: "select_player", recover: true },
  completed: { kind: "completed" },
  blocked_raw_audit: { kind: "blocked_raw_audit" },
  cancel_requested: { kind: "cancel_requested" },
  cancelled: { kind: "cancelled" },
  unknown: { kind: "unknown" },
};

function job(overrides: Partial<DemoJobView>): DemoJobView {
  return {
    jobId: "job-1",
    uploadId: "upload-1",
    fileName: "match.dem",
    status: "processing",
    stage: "parsing",
    errorCode: null,
    retryCount: 0,
    maxRetries: 2,
    matchId: null,
    demoAvailable: true,
    parserCurrent: true,
    extractionConfidence: null,
    partialParse: false,
    roundsValid: null,
    attachmentState: "unattached",
    attachmentReason: null,
    map: null,
    result: null,
    scorePlayer: null,
    scoreOpponent: null,
    queuedAt: "2026-09-12T00:00:00.000Z",
    finishedAt: null,
    attemptNumber: 1,
    supersedesJobId: null,
    supersededByJobId: null,
    replacementReason: null,
    ...overrides,
  };
}

const STATUS_JOBS: Record<string, Partial<DemoJobView>> = {
  pending: { status: "pending", stage: "queued" as DemoJobView["stage"] },
  parsing: { status: "processing", stage: "parsing" },
  metrics: { status: "processing", stage: "metrics" as DemoJobView["stage"] },
};

const withLocale = (locale: Locale, node: React.ReactNode) =>
  renderToString(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);

function snapshot() {
  const files = Object.fromEntries(PROTECTED_FILES.map((f) => [f, gitBlob(f)]));
  const keyList = protectedKeys();
  const keys = Object.fromEntries(
    LOCALES.map((l) => {
      const dict = dictionaries[l] as Record<string, string>;
      return [
        l,
        Object.fromEntries(keyList.map((k) => [k, sha("sha256", dict[k] ?? "∅").slice(0, 16)])),
      ];
    }),
  );
  const ssr: Record<string, string> = {};
  for (const l of LOCALES) {
    ssr[`UploadBox.demo.${l}`] = sha("sha256", withLocale(l, <UploadBox kind="demo" />));
  }
  for (const [name, phase] of Object.entries(FLOW_PHASES)) {
    ssr[`DemoFlowView.${name}`] = sha(
      "sha256",
      withLocale("pt-BR", <DemoFlowView {...flowProps(phase)} />),
    );
  }
  for (const [name, overrides] of Object.entries(STATUS_JOBS)) {
    ssr[`DemoProcessingStatus.${name}`] = sha(
      "sha256",
      withLocale("pt-BR", <DemoProcessingStatus job={job(overrides)} />),
    );
  }
  return { baseline: "9d86fecf", files, keys, ssr };
}

const current = snapshot();
if (UPDATE) writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
const pinned = existsSync(FIXTURE)
  ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as ReturnType<typeof snapshot>)
  : null;

describe("/upload protected flows", () => {
  it("the fixture exists and covers a non-trivial surface", () => {
    expect(pinned).not.toBeNull();
    expect(Object.keys(current.files)).toHaveLength(PROTECTED_FILES.length);
    expect(Object.keys(current.keys["pt-BR"] ?? {}).length).toBeGreaterThan(150);
    expect(Object.keys(current.ssr).length).toBe(5 + Object.keys(FLOW_PHASES).length + 3);
  });

  it("1. no protected file changed by a single byte", () => {
    expect(current.files).toEqual(pinned?.files);
  });

  it("2. no protected message changed in any of the five locales", () => {
    for (const l of LOCALES) expect({ [l]: current.keys[l] }).toEqual({ [l]: pinned?.keys[l] });
  });

  it("3. the upload box, every modal phase and the processing steps render byte-identical", () => {
    expect(current.ssr).toEqual(pinned?.ssr);
  });

  it("render is deterministic (the SSR lock is meaningful)", () => {
    expect(withLocale("pt-BR", <UploadBox kind="demo" />)).toBe(
      withLocale("pt-BR", <UploadBox kind="demo" />),
    );
  });
});
