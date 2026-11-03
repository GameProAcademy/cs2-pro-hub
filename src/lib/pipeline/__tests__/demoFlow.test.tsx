/**
 * Upload modal — presentation layer over the real demo lifecycle.
 * Numbers in test names refer to the acceptance list of the 2026-11-03 request.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoFlowView, type DemoFlowViewProps } from "@/components/pipeline/DemoFlowView";
import { formatBytes, phaseCopy } from "@/components/pipeline/demoFlowCopy";
import { deriveIdentityUiState } from "@/components/pipeline/DemoPlayerIdentity";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { demoFlowPtBR } from "@/i18n/locales/demoFlow/pt-BR";
import {
  EMPTY_FLOW_MEMORY,
  FLOW_STEPS,
  acceptJobSnapshot,
  activeStep,
  canCancel,
  canContinueInBackground,
  decideResume,
  deriveDemoFlowPhase,
  isDefinitivelyComplete,
  isLockedPhase,
  parseFlowMemory,
  stepStates,
  uploadPercent,
  warnBeforeUnload,
  type DemoFlowPhase,
  type FlowJob,
  type FlowUpload,
} from "@/lib/pipeline/demoFlow";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function job(overrides: Partial<FlowJob> = {}): FlowJob {
  return {
    jobId: JOB_ID,
    fileName: "match.dem",
    status: "processing",
    stage: "parsing",
    errorCode: null,
    retryCount: 0,
    matchId: null,
    demoAvailable: true,
    parserCurrent: true,
    attachmentState: "unattached",
    attachmentConfirmationStatus: "not_required",
    observedNickname: null,
    map: null,
    supersededByJobId: null,
    ...overrides,
  };
}

function upload(overrides: Partial<FlowUpload> = {}): FlowUpload {
  return {
    state: "uploading",
    percent: 42,
    fileName: "match.dem",
    fileSize: 150 * 1024 * 1024,
    error: null,
    ...overrides,
  };
}

const phase = (input: Parameters<typeof deriveDemoFlowPhase>[0]) => deriveDemoFlowPhase(input);

describe("upload (1-5)", () => {
  it("2: the bar follows the real upload percentage", () => {
    const p = phase({ upload: upload({ percent: 42 }), job: null, identity: null });
    expect(p).toEqual({ kind: "uploading", sub: "uploading", percent: 42 });
    expect(uploadPercent(p)).toBe(42);
  });

  it("3: hashing / registering / no byte measured yet → indeterminate (no invented %)", () => {
    for (const state of ["hashing", "registering"] as const) {
      const p = phase({ upload: upload({ state, percent: null }), job: null, identity: null });
      expect(uploadPercent(p)).toBeNull();
    }
    expect(
      uploadPercent(phase({ upload: upload({ percent: null }), job: null, identity: null })),
    ).toBeNull();
  });

  it("4: an upload error is a failure phase, never progress", () => {
    const p = phase({ upload: upload({ error: "STORAGE_ERROR" }), job: null, identity: null });
    expect(p).toEqual({ kind: "upload_failed", code: "STORAGE_ERROR" });
    expect(stepStates(p).upload).toBe("error");
  });

  it("5: a finished upload is NOT a finished analysis (waits for the job row)", () => {
    const p = phase({
      upload: upload({ state: "completed", percent: 100 }),
      job: null,
      identity: null,
    });
    expect(p.kind).toBe("waiting_job");
    expect(isLockedPhase(p)).toBe(true);
    expect(stepStates(p).done).toBe("pending");
  });
});

describe("processing (6-10)", () => {
  it("7: stages map to the real steps, in the backend's order", () => {
    const cases: Array<[Partial<FlowJob>, string]> = [
      [{ status: "pending", stage: "queued" }, "validate"],
      [{ status: "processing", stage: "validating" }, "validate"],
      [{ status: "processing", stage: "parsing" }, "read"],
      [{ status: "processing", stage: "raw_audit" }, "read"],
      [{ status: "processing", stage: "normalizing" }, "read"],
      [{ status: "processing", stage: "metrics" }, "metrics"],
      [{ status: "processing", stage: "persisting" }, "metrics"],
      [{ status: "processing", stage: "cleanup" }, "metrics"],
    ];
    for (const [overrides, step] of cases) {
      expect(activeStep(phase({ upload: null, job: job(overrides), identity: null }))).toBe(step);
    }
  });

  it("7: a step is shown done only when a later real stage was reported", () => {
    const s = stepStates(phase({ upload: null, job: job({ stage: "parsing" }), identity: null }));
    expect(s).toEqual({
      upload: "done",
      validate: "done",
      read: "active",
      metrics: "pending",
      identify: "pending",
      done: "pending",
    });
  });

  it("8: a duplicate snapshot changes nothing", () => {
    const a = job({ stage: "metrics" });
    expect(acceptJobSnapshot(a, { ...a })).toEqual(a);
  });

  it("9: a late (older) response never moves the modal backwards", () => {
    const newer = job({ stage: "metrics" });
    expect(acceptJobSnapshot(newer, job({ stage: "parsing" }))).toBe(newer);
    expect(acceptJobSnapshot(newer, job({ status: "pending", stage: "queued" }))).toBe(newer);
    const done = job({ status: "processed", stage: "done" });
    expect(acceptJobSnapshot(done, job({ stage: "cleanup" }))).toBe(done);
    // an older dispatch (retry_count) is ignored; a newer one is followed
    const second = job({ retryCount: 1, stage: "parsing" });
    expect(
      acceptJobSnapshot(second, job({ retryCount: 0, status: "processed", stage: "done" })),
    ).toBe(second);
    const requeued = job({ retryCount: 2, status: "pending", stage: "queued" });
    expect(acceptJobSnapshot(done, requeued)).toBe(requeued);
    // a terminal snapshot may be refined by another terminal one
    const attached = { ...done, attachmentState: "attached" };
    expect(acceptJobSnapshot(done, attached)).toBe(attached);
    // another job replaces the tracked one outright
    const other = job({ jobId: OTHER_ID, stage: "queued", status: "pending" });
    expect(acceptJobSnapshot(done, other)).toBe(other);
  });

  it("10: an unknown status is never success", () => {
    const p = phase({ upload: null, job: job({ status: "weird_new_state" }), identity: null });
    expect(p.kind).toBe("unknown");
    expect(stepStates(p).done).toBe("pending");
    expect(isDefinitivelyComplete(job({ status: "weird_new_state" }))).toBe(false);
  });

  it("cancel is offered exactly where the card offers it (pending / processing)", () => {
    expect(canCancel(job({ status: "pending" }))).toBe(true);
    expect(canCancel(job({ status: "processing" }))).toBe(true);
    for (const status of [
      "processed",
      "failed",
      "cancel_requested",
      "cancelled",
      "blocked_raw_audit",
    ])
      expect(canCancel(job({ status }))).toBe(false);
    expect(
      phase({ upload: null, job: job({ status: "cancel_requested" }), identity: null }).kind,
    ).toBe("cancel_requested");
    expect(phase({ upload: null, job: job({ status: "cancelled" }), identity: null }).kind).toBe(
      "cancelled",
    );
  });
});

describe("identification (11-19)", () => {
  const processed = (overrides: Partial<FlowJob> = {}) =>
    job({ status: "processed", stage: "done", matchId: "m-1", ...overrides });

  it("11: a safe automatic Steam match asks only the existing one-click confirmation", () => {
    const j = processed({
      attachmentState: "attached",
      attachmentConfirmationStatus: "pending_confirmation",
    });
    // the card's own rule decides the identity state
    const identity = deriveIdentityUiState(
      {
        attachmentState: "attached",
        attachmentMethod: "steam_id_confirmed",
        attachmentSource: "steam",
        confirmationStatus: "pending_confirmation",
      } as never,
      { loading: false, error: false, manualMode: false },
    );
    expect(identity).toBe("automatic_review");
    expect(phase({ upload: null, job: j, identity }).kind).toBe("confirm_automatic");
    expect(isDefinitivelyComplete(j)).toBe(false);
  });

  it("12: an unresolved or conflicting identity opens the player selection", () => {
    for (const identity of ["manual_selection", "conflict"] as const) {
      expect(phase({ upload: null, job: processed(), identity })).toEqual({
        kind: "select_player",
        recover: false,
      });
    }
  });

  it("13/14/15: only the players passed (from the demo) are listed, none preselected, CTA disabled", () => {
    const html = render(
      { kind: "select_player", recover: false },
      {
        participants: [
          { participantKey: "p:1", nickname: "alpha", team: "CT" },
          { participantKey: "p:2", nickname: "bravo", team: "T" },
        ],
        suggestedKey: "p:2",
      },
    );
    expect(html).toContain("alpha");
    expect(html).toContain("bravo");
    expect((html.match(/type="radio"/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
    expect(html).toContain(dictionaries["pt-BR"]["demoFlow.select.required"]);
    const cta = html.split(dictionaries["pt-BR"]["demoFlow.select.cta"])[0] ?? "";
    expect(cta.slice(cta.lastIndexOf("<button"))).toContain("disabled");
  });

  it("16/18/19: the modal confirms through the existing action only; no job, no upload", () => {
    const modal = readFileSync(resolve("src/components/pipeline/DemoFlowModal.tsx"), "utf8");
    expect(modal).toContain(
      "declareDemoPlayer({ data: { jobId: jobId as string, participantKey } })",
    );
    expect(modal).toContain(
      "decideAutomaticDemoPlayer({ data: { jobId: jobId as string, action } })",
    );
    for (const forbidden of [
      "submitDemo",
      "createDemoUpload",
      "enqueueDemoJob",
      "retryMyDemoJob",
      "reprocessDemoWithCurrentParser",
    ]) {
      expect(modal).not.toContain(forbidden);
    }
    // only a key the server returned for this demo can be selected or sent
    expect(modal).toContain("participants.some((p) => p.participantKey === key)");
    expect(modal).toContain("participants.some((p) => p.participantKey === selected)");
  });

  it("17: a failed confirmation keeps the modal on the selection, with the error shown", () => {
    const html = render(
      { kind: "select_player", recover: false },
      {
        participants: [{ participantKey: "p:1", nickname: "alpha", team: null }],
        identityErrorKey: "pipeline.identify.saveError",
      },
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(dictionaries["pt-BR"]["pipeline.identify.saveError"]);
    expect(html).toContain("alpha");
    expect(isLockedPhase({ kind: "select_player", recover: false })).toBe(true);
  });

  it("after the choice, the SAME job attaching is shown as metrics after identification", () => {
    const p = phase({
      upload: null,
      job: job({
        status: "pending",
        stage: "queued",
        matchId: "m-1",
        attachmentState: "attached",
        attachmentConfirmationStatus: "manual_selected",
      }),
      identity: null,
    });
    expect(p).toEqual({ kind: "attaching", stage: "queued" });
    expect(stepStates(p)).toMatchObject({ identify: "done", metrics: "active", done: "pending" });
  });

  it("identity says confirmed but the job row has not caught up → keep waiting", () => {
    expect(phase({ upload: null, job: processed(), identity: "manual_selected" }).kind).toBe(
      "identity_loading",
    );
  });

  it("a failed job with analysed players offers select-and-retry (existing rule)", () => {
    const p = phase({
      upload: null,
      job: job({ status: "failed", matchId: "m-1", errorCode: "CANONICAL_PERSISTENCE_ERROR" }),
      identity: "manual_selection",
    });
    expect(p).toEqual({
      kind: "failed",
      code: "CANONICAL_PERSISTENCE_ERROR",
      action: "select_and_retry",
    });
  });

  it("an older-parser or expired demo is sent to the card's existing action", () => {
    expect(
      phase({ upload: null, job: processed({ parserCurrent: false }), identity: null }),
    ).toEqual({
      kind: "needs_card_action",
      action: "reprocess_current_parser",
    });
    expect(
      phase({
        upload: null,
        job: processed({ parserCurrent: false, demoAvailable: false }),
        identity: null,
      }),
    ).toEqual({ kind: "needs_card_action", action: "reupload_required" });
  });
});

describe("completion (20-24)", () => {
  it("20: complete only when processed AND attached AND confirmed (backend's definition)", () => {
    const base = job({ status: "processed", stage: "done", matchId: "m" });
    expect(isDefinitivelyComplete(base)).toBe(false);
    expect(isDefinitivelyComplete({ ...base, attachmentState: "attached" })).toBe(false);
    expect(
      isDefinitivelyComplete({
        ...base,
        attachmentState: "attached",
        attachmentConfirmationStatus: "pending_confirmation",
      }),
    ).toBe(false);
    for (const status of ["user_confirmed", "manual_selected"]) {
      const done = { ...base, attachmentState: "attached", attachmentConfirmationStatus: status };
      expect(isDefinitivelyComplete(done)).toBe(true);
      expect(phase({ upload: null, job: done, identity: null }).kind).toBe("completed");
    }
    // processing with a confirmed identity is still not complete
    expect(
      isDefinitivelyComplete(
        job({ attachmentState: "attached", attachmentConfirmationStatus: "manual_selected" }),
      ),
    ).toBe(false);
  });

  it("21/22: completion shows nickname, map, the analysis button and the auto-close notice", () => {
    const html = render(
      { kind: "completed" },
      { nickname: "alpha", map: "de_mirage", autoCloseSeconds: 8 },
    );
    expect(html).toContain("alpha");
    expect(html).toContain("de_mirage");
    expect(html).toContain(dictionaries["pt-BR"]["demoFlow.done.cta"]);
    expect(html).toContain("8 s");
    expect(isLockedPhase({ kind: "completed" })).toBe(false);
  });

  it("23/24: the card and history stay: the modal is rendered beside them, not instead", () => {
    const panel = readFileSync(resolve("src/components/pipeline/DemoIngestPanel.tsx"), "utf8");
    expect(panel).toContain("<DemoFlowModal");
    expect(panel).toContain('t("pipeline.historyTitle")');
    expect(panel).toContain("<DemoProcessingStatus job={job} />");
    // the card does not open a second identity dialog for the job the modal follows
    expect(panel).toContain("autoOpen={!flowOpen && !flowHandled.includes(job.jobId)}");
    const identity = readFileSync(
      resolve("src/components/pipeline/DemoPlayerIdentity.tsx"),
      "utf8",
    );
    expect(identity).toContain(
      "if (autoOpen && !recover && identity.data && (automatic || needsManual))",
    );
  });
});

describe("recovery (25-30)", () => {
  const now = 1_800_000_000_000;

  it("25: an upload interrupted by a reload is reported, never restarted", () => {
    const memory = parseFlowMemory(
      JSON.stringify({ upload: { fileName: "a.dem", fileSize: 10, startedAt: now - 1000 } }),
      now,
    );
    expect(decideResume(memory, [])).toEqual({
      kind: "upload_interrupted",
      fileName: "a.dem",
      fileSize: 10,
    });
    expect(phase({ upload: null, job: null, identity: null, uploadInterrupted: true }).kind).toBe(
      "upload_interrupted",
    );
  });

  it("26/29: the tracked job is followed again after a reload", () => {
    const memory = { ...EMPTY_FLOW_MEMORY, trackedJobId: JOB_ID };
    expect(decideResume(memory, [job()])).toEqual({ kind: "job", jobId: JOB_ID });
  });

  it("27: a pending player selection is reopened (processed, not yet confirmed)", () => {
    const memory = { ...EMPTY_FLOW_MEMORY, trackedJobId: JOB_ID };
    const waiting = job({ status: "processed", stage: "done", matchId: "m" });
    expect(decideResume(memory, [waiting])).toEqual({ kind: "job", jobId: JOB_ID });
  });

  it("28: without local memory, an active job of the user is followed again", () => {
    expect(decideResume(EMPTY_FLOW_MEMORY, [job({ status: "pending", stage: "queued" })])).toEqual({
      kind: "job",
      jobId: JOB_ID,
    });
  });

  it("30: recovery never creates anything; finished, cancelled or dismissed jobs are not reopened", () => {
    const tracked = { ...EMPTY_FLOW_MEMORY, trackedJobId: JOB_ID };
    const done = job({
      status: "processed",
      stage: "done",
      attachmentState: "attached",
      attachmentConfirmationStatus: "user_confirmed",
    });
    expect(decideResume(tracked, [done])).toEqual({ kind: "none" });
    expect(decideResume(tracked, [job({ status: "cancelled" })])).toEqual({ kind: "none" });
    expect(decideResume({ ...tracked, dismissed: [JOB_ID] }, [job()])).toEqual({ kind: "none" });
    // a replacement attempt is followed instead of the superseded job
    expect(
      decideResume(tracked, [job({ supersededByJobId: OTHER_ID }), job({ jobId: OTHER_ID })]),
    ).toEqual({ kind: "job", jobId: OTHER_ID });
  });

  it("stored memory is parsed defensively", () => {
    expect(parseFlowMemory("not json", now)).toEqual(EMPTY_FLOW_MEMORY);
    expect(
      parseFlowMemory(JSON.stringify({ trackedJobId: "x'; drop" }), now).trackedJobId,
    ).toBeNull();
    // a stale upload marker (> 24 h) is ignored
    expect(
      parseFlowMemory(
        JSON.stringify({ upload: { fileName: "a", fileSize: 1, startedAt: now - 2e8 } }),
        now,
      ).upload,
    ).toBeNull();
  });
});

describe("navigation lock (31-35)", () => {
  const modal = readFileSync(resolve("src/components/pipeline/DemoFlowModal.tsx"), "utf8");

  it("31/32: router-level blocker + inert background while locked", () => {
    expect(modal).toContain("useBlocker({");
    expect(modal).toContain("shouldBlockFn: () => locked");
    expect(modal).toContain('child.setAttribute("inert", "")');
  });

  it("33/34: outside clicks ignored; Escape never interrupts a critical step", () => {
    expect(modal).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
    expect(modal).toContain("onInteractOutside={(event) => event.preventDefault()}");
    expect(modal).toMatch(/onEscapeKeyDown=\{\(event\) => \{\s*event\.preventDefault\(\);/);
    expect(modal).toContain("if (!locked) onDismiss(");
  });

  it("locked phases, background and unload warning", () => {
    const locked: DemoFlowPhase[] = [
      { kind: "uploading", sub: "uploading", percent: 1 },
      { kind: "queued" },
      { kind: "processing", stage: "parsing" },
      { kind: "select_player", recover: false },
      { kind: "confirm_automatic" },
    ];
    for (const p of locked) expect(isLockedPhase(p)).toBe(true);
    for (const p of [
      { kind: "completed" },
      { kind: "cancelled" },
      { kind: "unknown" },
    ] as DemoFlowPhase[])
      expect(isLockedPhase(p)).toBe(false);
    // background only where the server keeps working by itself
    expect(canContinueInBackground({ kind: "uploading", sub: "uploading", percent: 1 })).toBe(
      false,
    );
    expect(canContinueInBackground({ kind: "select_player", recover: false })).toBe(false);
    expect(canContinueInBackground({ kind: "processing", stage: "metrics" })).toBe(true);
    // leaving the page is warned about only while the browser is sending bytes
    expect(warnBeforeUnload({ kind: "uploading", sub: "uploading", percent: 1 })).toBe(true);
    expect(warnBeforeUnload({ kind: "processing", stage: "metrics" })).toBe(false);
  });

  it("35: dialog semantics — title, description, live status", () => {
    expect(modal).toContain("<DialogPrimitive.Root open={open} modal>");
    expect(modal).toContain('aria-describedby="demo-flow-description"');
    expect(modal).toContain("<DialogPrimitive.Title");
    const html = render({ kind: "processing", stage: "parsing" });
    expect(html).toContain('id="demo-flow-description"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

// --------------------------------------------------------------------------------------
const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const noop = () => undefined;

function render(
  p: DemoFlowPhase,
  overrides: Partial<DemoFlowViewProps> = {},
  locale: Locale = "pt-BR",
): string {
  const props: DemoFlowViewProps = {
    phase: p,
    fileName: "match.dem",
    fileSize: 150 * 1024 * 1024,
    errorKey: null,
    stageKey: "pipeline.processing.parsing.title",
    nickname: null,
    map: null,
    offline: false,
    resumed: false,
    participants: [],
    suggestedKey: null,
    selectedKey: null,
    onSelect: noop,
    onConfirmSelection: noop,
    identityBusy: false,
    identityErrorKey: null,
    onConfirmAutomatic: noop,
    onRejectAutomatic: noop,
    onReloadIdentity: noop,
    onDecideLater: noop,
    cancelAvailable: false,
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
    ...overrides,
  };
  return renderToString(
    <I18nProvider initialLocale={locale}>
      <DemoFlowView {...props} />
    </I18nProvider>,
  );
}

const ALL_PHASES: DemoFlowPhase[] = [
  { kind: "uploading", sub: "hashing", percent: null },
  { kind: "uploading", sub: "uploading", percent: 37 },
  { kind: "upload_failed", code: "STORAGE_ERROR" },
  { kind: "upload_interrupted" },
  { kind: "waiting_job" },
  { kind: "queued" },
  { kind: "processing", stage: "validating" },
  { kind: "processing", stage: "parsing" },
  { kind: "processing", stage: "metrics" },
  { kind: "attaching", stage: "queued" },
  { kind: "identity_loading" },
  { kind: "identity_error" },
  { kind: "confirm_automatic" },
  { kind: "select_player", recover: false },
  { kind: "completed" },
  { kind: "needs_card_action", action: "reprocess_current_parser" },
  { kind: "failed", code: "PARSER_ERROR", action: null },
  { kind: "blocked_raw_audit" },
  { kind: "cancel_requested" },
  { kind: "cancelled" },
  { kind: "unknown" },
];

describe("internationalisation (36-40)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every phase renders its own copy, with no raw key and no other language`, () => {
      const dict = dictionaries[locale];
      for (const p of ALL_PHASES) {
        const html = render(
          p,
          {
            participants: [{ participantKey: "p:1", nickname: "alpha", team: "CT" }],
            errorKey: "pipeline.error.PROCESSING_ERROR",
            nickname: "alpha",
            map: "de_mirage",
            autoCloseSeconds: 5,
          },
          locale,
        );
        const copy = phaseCopy(p);
        expect(html, `${locale} ${p.kind}`).toContain(escapeHtml(dict[copy.title]));
        expect(html).not.toMatch(/demoFlow\.[a-zA-Z.]+/);
        for (const step of FLOW_STEPS) {
          expect(html).toContain(escapeHtml(dict[`demoFlow.step.${step}` as keyof typeof dict]));
        }
      }
    });
  }

  it("every demoFlow key exists, non-empty, in all five dictionaries", () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(demoFlowPtBR)) {
        const value = dictionaries[locale][key as keyof (typeof dictionaries)["pt-BR"]];
        expect(value, `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it("every translation key the modal files reference exists in all five dictionaries", () => {
    const sources = [
      "src/components/pipeline/DemoFlowView.tsx",
      "src/components/pipeline/DemoFlowModal.tsx",
      "src/components/pipeline/demoFlowCopy.ts",
    ].map((file) => readFileSync(resolve(file), "utf8"));
    const keys = new Set(
      sources.flatMap((source) =>
        [...source.matchAll(/"((?:demoFlow|pipeline)\.[A-Za-z0-9_.]+)"/g)].map(
          (m) => m[1] as string,
        ),
      ),
    );
    expect(keys.size).toBeGreaterThan(40);
    for (const locale of LOCALES)
      for (const key of keys)
        expect(
          dictionaries[locale][key as keyof (typeof dictionaries)["pt-BR"]],
          `${locale}:${key}`,
        ).toBeTruthy();
  });

  it("the translations differ from Portuguese where the language differs", () => {
    for (const locale of ["en", "es", "fr"] as const)
      expect(dictionaries[locale]["demoFlow.select.title"]).not.toBe(
        demoFlowPtBR["demoFlow.select.title"],
      );
    expect(dictionaries["pt-PT"]["demoFlow.file"]).toBe("Ficheiro");
  });
});

describe("rendering details", () => {
  it("measured upload: a determinate progressbar with the real value", () => {
    const html = render({ kind: "uploading", sub: "uploading", percent: 37 });
    expect(html).toContain('aria-valuenow="37"');
    expect(html).toContain("37%");
    expect(html).toContain("150.0 MB");
  });

  it("no measurement: indeterminate bar, no percentage text", () => {
    const html = render({ kind: "uploading", sub: "hashing", percent: null });
    expect(html).toContain('data-indeterminate="true"');
    expect(html).not.toContain("aria-valuenow");
    // server stages are not individually measurable either
    expect(render({ kind: "processing", stage: "parsing" })).not.toContain("aria-valuenow");
  });

  it("background and cancel buttons only where allowed", () => {
    const processing = render({ kind: "processing", stage: "parsing" }, { cancelAvailable: true });
    expect(processing).toContain(dictionaries["pt-BR"]["demoFlow.background"]);
    expect(processing).toContain(dictionaries["pt-BR"]["demoFlow.cancel"]);
    const uploading = render({ kind: "uploading", sub: "uploading", percent: 5 });
    expect(uploading).not.toContain(dictionaries["pt-BR"]["demoFlow.background"]);
    expect(uploading).not.toContain(dictionaries["pt-BR"]["demoFlow.cancel"]);
    const asking = render(
      { kind: "processing", stage: "parsing" },
      { cancelAvailable: true, cancelAsking: true },
    );
    expect(asking).toContain(escapeHtml(dictionaries["pt-BR"]["demoFlow.cancelQuestion"]));
  });

  it("file size formatting", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
  });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
