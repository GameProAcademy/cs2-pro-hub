import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { en } from "@/i18n/locales/en";
import { es } from "@/i18n/locales/es";
import { fr } from "@/i18n/locales/fr";
import { ptBR } from "@/i18n/locales/pt-BR";
import { ptPT } from "@/i18n/locales/pt-PT";
import { PipelineError, isPermanentError } from "@/lib/pipeline/errors";
import { mapParserErrorCode } from "@/lib/pipeline/parser/adapter";
import { classifyWorkerFailure } from "@/lib/pipeline/parser/parserEndpoint";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * FASE 2.7.2 — a structurally incomplete demo is rejected, never analysed
 * partially, and the player sees a friendly explanation with no internals.
 */
describe("FASE 2.7.2 — CORRUPTED_DEMO handling", () => {
  it("classifies the worker's CORRUPTED_DEMO as CORRUPTED_DEMO", () => {
    const error = classifyWorkerFailure(422, { detail: { error_code: "CORRUPTED_DEMO" } });
    expect(error.code).toBe("CORRUPTED_DEMO");
    expect(mapParserErrorCode("CORRUPTED_DEMO").code).toBe("CORRUPTED_DEMO");
  });

  it("treats it as a permanent failure (no automatic retry)", () => {
    expect(isPermanentError("CORRUPTED_DEMO")).toBe(true);
    expect(new PipelineError("CORRUPTED_DEMO").permanent).toBe(true);
    expect(classifyWorkerFailure(422, { detail: { error_code: "CORRUPTED_DEMO" } }).permanent).toBe(
      true,
    );
  });

  it("keeps the rest of the error matrix intact", () => {
    expect(mapParserErrorCode("INVALID_DEMO_FORMAT").code).toBe("INVALID_DEMO_FORMAT");
    expect(mapParserErrorCode("UNSUPPORTED_DEMO").code).toBe("UNSUPPORTED_DEMO");
    expect(mapParserErrorCode("TIMEOUT").code).toBe("PARSER_TIMEOUT");
    expect(isPermanentError("PARSER_TIMEOUT")).toBe(false);
    expect(isPermanentError("PARSER_UNAVAILABLE")).toBe(false);
    expect(isPermanentError("PARSER_HASH_MISMATCH")).toBe(true);
    expect(isPermanentError("PARSER_FILE_SIZE_MISMATCH")).toBe(true);
  });

  it("refuses to re-queue a permanently failed job server-side", () => {
    const source = read("src/lib/pipeline.functions.ts");
    expect(source).toContain("isPermanentError");
    expect(source).toMatch(/isPermanentError\(code\)[\s\S]*JOB_NOT_RETRYABLE/);
  });

  it("throws before any canonical persistence, metrics or features", () => {
    const source = read("src/lib/pipeline/jobs.server.ts");
    const parseAt = source.indexOf("adapter.parseDemo");
    for (const marker of ["computeMetrics(", "extractFeatures(", "persistCanonicalObservation("]) {
      expect(source.indexOf(marker)).toBeGreaterThan(parseAt);
    }
  });

  it("ships the friendly copy in every locale", () => {
    for (const dict of [ptBR, en, es, fr, ptPT]) {
      const title = dict["pipeline.corrupted.title"];
      const body = dict["pipeline.corrupted.body"];
      const cta = dict["pipeline.corrupted.cta"];
      for (const text of [title, body, cta]) {
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(3);
        for (const leak of [
          "CORRUPTED_DEMO",
          "demoparser2",
          "sha256",
          "SHA-256",
          "storage",
          "Worker",
          "stack",
        ]) {
          expect(text).not.toContain(leak);
        }
      }
      expect(body.toLowerCase()).toMatch(/incomplet|corromp|corrupt/);
    }
    expect(ptBR["pipeline.corrupted.title"]).toBe("Não conseguimos analisar esta demo");
    expect(ptBR["pipeline.corrupted.cta"]).toBe("Enviar outra demo");
  });

  it("renders the dedicated failure state and hides retry for permanent failures", () => {
    const panel = read("src/components/pipeline/DemoIngestPanel.tsx");
    expect(panel).toContain('job.errorCode === "CORRUPTED_DEMO"');
    expect(panel).toContain("pipeline.corrupted.title");
    expect(panel).toContain("pipeline.corrupted.body");
    expect(panel).toContain("pipeline.corrupted.cta");
    expect(panel).toContain("!isPermanentCode(job.errorCode)");
    // Never a partial-success badge on a failed job.
    expect(panel).toContain('job.partialParse && job.status !== "failed"');
  });
});
