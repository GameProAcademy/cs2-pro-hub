import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DemoProcessingStatus } from "@/components/pipeline/DemoProcessingStatus";
import { I18nProvider } from "@/i18n";
import { dictionaries } from "@/i18n/config";
import type { DemoJobView } from "@/lib/pipeline.functions";
import {
  STAGE_PROGRESS,
  advanceVisualProgress,
  estimatedStageProgress,
  stageProgressCeiling,
} from "@/lib/pipeline/processingProgress";

const root = process.cwd();

function job(overrides: Partial<DemoJobView> = {}): DemoJobView {
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
    ...overrides,
  };
}

describe("estimated demo processing progress", () => {
  it("maps every real stage to its deterministic baseline", () => {
    expect(STAGE_PROGRESS).toEqual({
      queued: 5,
      validating: 15,
      parsing: 40,
      normalizing: 60,
      metrics: 78,
      persisting: 90,
      cleanup: 96,
      done: 100,
    });
  });

  it("never moves backwards across polling responses", () => {
    expect(
      estimatedStageProgress({ stage: "parsing", status: "processing", previousProgress: 62 }),
    ).toBe(62);
  });

  it("freezes on failure", () => {
    expect(
      estimatedStageProgress({ stage: "failed", status: "failed", previousProgress: 73 }),
    ).toBe(73);
  });

  it("uses a safe fallback for an unknown stage", () => {
    expect(estimatedStageProgress({ stage: "future-stage", status: "pending" })).toBe(5);
    expect(estimatedStageProgress({ stage: "future-stage", status: "processing" })).toBe(15);
  });

  it("caps visual motion below the next stage and below completion", () => {
    expect(
      estimatedStageProgress({ stage: "parsing", status: "processing", animationStep: 500 }),
    ).toBe(stageProgressCeiling("parsing"));
    expect(stageProgressCeiling("cleanup")).toBe(99);
    expect(advanceVisualProgress("parsing", "processing", 40)).toBe(41);
    expect(advanceVisualProgress("parsing", "processing", 59)).toBe(59);
  });

  it("reaches 100 only when processed", () => {
    expect(estimatedStageProgress({ stage: "done", status: "processed" })).toBe(100);
  });
});

describe("demo processing experience", () => {
  it("renders an accessible progressbar from the real stage", () => {
    const html = renderToString(
      <I18nProvider>
        <DemoProcessingStatus job={job()} />
      </I18nProvider>,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("Lendo sua partida");
  });

  it("has every processing translation in all five locales", () => {
    const keys = Object.keys(dictionaries["pt-BR"]).filter((key) =>
      key.startsWith("pipeline.processing."),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const dictionary of Object.values(dictionaries)) {
      for (const key of keys) {
        expect(dictionary[key as keyof typeof dictionary]).toBeTruthy();
      }
    }
  });

  it("preserves the existing single four-second polling loop", () => {
    const panel = readFileSync(join(root, "src/components/pipeline/DemoIngestPanel.tsx"), "utf8");
    expect(panel.match(/refetchInterval/g)).toHaveLength(1);
    expect(panel).toMatch(/\? 4000\s*: false/);
  });
});
