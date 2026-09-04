import { describe, expect, it } from "vitest";

import {
  coverageFromSamples,
  coverageRatio,
  emptyCoverage,
  DATA_SIGNALS,
  SOURCE_CAPABILITIES,
} from "../capabilities";
import { computeReadiness } from "../readiness";
import { parsePublicProfileUrl } from "../publicProfile";
import { describeSource, getSourceAdapter } from "../registry";
import {
  CONNECTABLE_SOURCES,
  DATA_SOURCES,
  isDataSource,
  isSourceImplemented,
  preferredSource,
} from "../sources";

describe("data sources", () => {
  it("only demo and faceit are implemented", () => {
    expect(isSourceImplemented("demo")).toBe(true);
    expect(isSourceImplemented("faceit")).toBe(true);
    for (const source of DATA_SOURCES.filter((s) => s !== "demo" && s !== "faceit")) {
      expect(isSourceImplemented(source)).toBe(false);
    }
  });


  it("demo always wins the priority comparison", () => {
    for (const source of CONNECTABLE_SOURCES) {
      expect(preferredSource("demo", source)).toBe("demo");
      expect(preferredSource(source, "demo")).toBe("demo");
    }
  });

  it("rejects unknown source identifiers", () => {
    expect(isDataSource("faceit")).toBe(true);
    expect(isDataSource("FACEIT")).toBe(false);
    expect(isDataSource("valorant")).toBe(false);
  });

  it("never claims capabilities for unvalidated sources", () => {
    for (const source of CONNECTABLE_SOURCES) {
      const capabilities = SOURCE_CAPABILITIES[source];
      for (const signal of DATA_SIGNALS) {
        expect(capabilities[signal]).not.toBe("supported");
      }
    }
  });

  it("describes the demo source as non-connectable", () => {
    expect(describeSource("demo").connectable).toBe(false);
    expect(describeSource("faceit").connectable).toBe(true);
  });
});

describe("unimplemented adapters", () => {
  it("report unavailability instead of pretending", () => {
    for (const source of CONNECTABLE_SOURCES) {
      expect(getSourceAdapter(source).availability()).toEqual({
        available: false,
        reason: "not_implemented",
      });
    }
  });

  it("throw rather than return fabricated matches", async () => {
    await expect(getSourceAdapter("steam").collectMatches({ externalId: "1" })).rejects.toThrow(
      /not implemented/i,
    );
  });
});

describe("coverage", () => {
  it("treats missing data as unavailable, never as zero", () => {
    const coverage = coverageFromSamples({ kills: 10, utility: null });
    expect(coverage.kills).toBe("available");
    expect(coverage.utility).toBe("unavailable");
    expect(coverage.economy).toBe("unavailable");
  });

  it("marks small samples as partial", () => {
    const coverage = coverageFromSamples({ clutches: 1 }, { clutches: 3 });
    expect(coverage.clutches).toBe("partial");
  });

  it("scores an empty coverage as zero", () => {
    expect(coverageRatio(emptyCoverage())).toBe(0);
  });
});

describe("analysis readiness", () => {
  it("returns none without data", () => {
    const readiness = computeReadiness({ rounds: 0, coverage: emptyCoverage(), sources: [] });
    expect(readiness.level).toBe("none");
    expect(readiness.limitations).toContain("no_data");
  });

  it("degrades to partial on a small round sample", () => {
    const coverage = coverageFromSamples(
      Object.fromEntries(DATA_SIGNALS.map((signal) => [signal, 5])),
    );
    const readiness = computeReadiness({ rounds: 3, coverage, sources: ["demo"] });
    expect(readiness.level).toBe("partial");
    expect(readiness.limitations).toContain("low_rounds");
  });

  it("is ready with a full sample and full coverage", () => {
    const coverage = coverageFromSamples(
      Object.fromEntries(DATA_SIGNALS.map((signal) => [signal, 30])),
    );
    const readiness = computeReadiness({ rounds: 24, coverage, sources: ["demo"] });
    expect(readiness.level).toBe("ready");
    expect(readiness.coverage).toBe(100);
    expect(readiness.limitations).toEqual([]);
  });

  it("flags missing utility/economy/positioning explicitly", () => {
    const coverage = coverageFromSamples(
      Object.fromEntries(
        DATA_SIGNALS.map((signal) => [
          signal,
          signal === "utility" || signal === "economy" || signal === "positioning" ? null : 30,
        ]),
      ),
    );
    const readiness = computeReadiness({ rounds: 24, coverage, sources: ["demo"] });
    expect(readiness.limitations).toContain("no_utility_data");
    expect(readiness.limitations).toContain("no_economy_data");
    expect(readiness.limitations).toContain("no_positioning_data");
  });
});

describe("public profile validation", () => {
  it("accepts supported https hosts and normalises them", () => {
    const result = parsePublicProfileUrl("https://www.faceit.com/en/players/someone/");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("faceit");
    expect(result.normalizedUrl).toBe("https://faceit.com/en/players/someone");
  });

  it("maps Steam and Gamers Club hosts", () => {
    expect(parsePublicProfileUrl("https://steamcommunity.com/id/x").source).toBe("steam");
    expect(parsePublicProfileUrl("https://gamersclub.com.br/player/1").source).toBe("gamers_club");
  });

  it("rejects empty, malformed, insecure and unsupported urls", () => {
    expect(parsePublicProfileUrl("   ").error).toBe("empty");
    expect(parsePublicProfileUrl("not a url").error).toBe("invalid_url");
    expect(parsePublicProfileUrl("http://faceit.com/x").error).toBe("insecure_url");
    expect(parsePublicProfileUrl("https://evil.example.com/x").error).toBe("unsupported_host");
  });

  it("does not treat a lookalike host as supported", () => {
    expect(parsePublicProfileUrl("https://faceit.com.attacker.net/x").error).toBe(
      "unsupported_host",
    );
  });
});
