/**
 * After "Sim, sou eu" (or a choice from the list) attaches the player, the dialog shows only the
 * result: the full player list must not flash back. A conflict or a not-found result keeps the
 * list so the player can choose again; with no detected players the empty notice stays.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { identityDialogBody } from "@/components/pipeline/DemoPlayerIdentity";

describe("identity dialog body", () => {
  it("asks the suggestion first, then the list when the player asks for it", () => {
    expect(identityDialogBody({ askSuggestion: true, attached: false, participants: 10 })).toBe(
      "suggestion",
    );
    expect(identityDialogBody({ askSuggestion: false, attached: false, participants: 10 })).toBe(
      "list",
    );
    expect(identityDialogBody({ askSuggestion: false, attached: false, participants: 0 })).toBe(
      "empty",
    );
  });

  it("once attached, never the list again (the bug seen after confirming the suggestion)", () => {
    for (const askSuggestion of [true, false])
      for (const participants of [0, 10])
        expect(identityDialogBody({ askSuggestion, attached: true, participants })).toBe(
          "result_only",
        );
  });

  it("the component renders the list only through this rule", () => {
    const source = readFileSync(resolve("src/components/pipeline/DemoPlayerIdentity.tsx"), "utf8");
    expect(source).toContain('body === "result_only" ? null');
    expect(source).toContain(') : body === "list" ? (');
    expect(source).not.toContain(") : participants.length > 0 ? (");
  });
});
