import { describe, expect, it } from "vitest";

import {
  CS2_MAP_POOL_VERSIONS,
  CURRENT_MAP_POOL_VERSION,
  activeDutyMaps,
  isActiveDuty,
  mapDisplayName,
  mapPoolStatus,
  normalizeMapCode,
  resolveMapPool,
} from "@/lib/cs2/maps";

describe("cs2 map pool", () => {
  it("has six ordered versions of seven maps each", () => {
    const dates = CS2_MAP_POOL_VERSIONS.map((v) => new Date(v.effectiveFrom).getTime());
    expect(CS2_MAP_POOL_VERSIONS).toHaveLength(6);
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(CS2_MAP_POOL_VERSIONS.every((v) => v.activeDuty.length === 7)).toBe(true);
    expect(CURRENT_MAP_POOL_VERSION.version).toBe(6);
  });

  it.each([
    ["2024-04-24", 1],
    ["2024-04-25", 2],
    ["2025-01-27", 2],
    ["2025-01-28", 3],
    ["2025-07-15", 3],
    ["2025-07-16", 4],
    ["2026-01-20", 4],
    ["2026-01-21", 5],
    ["2026-07-07", 5],
    ["2026-07-08", 6],
  ])("resolves %s to version %i", (date, version) => {
    expect(resolveMapPool(date).version).toBe(version);
  });

  it("clamps dates before the first version and never invents a future version", () => {
    expect(resolveMapPool("2020-01-01").version).toBe(1);
    expect(resolveMapPool("2099-01-01").version).toBe(6);
    expect(resolveMapPool(new Date()).version).toBe(6);
  });

  it("exposes the per-version pool membership", () => {
    expect(activeDutyMaps("2024-01-01")).toContain("overpass");
    expect(activeDutyMaps("2024-01-01")).not.toContain("dust2");
    expect(activeDutyMaps("2025-02-01")).toContain("train");
    expect(activeDutyMaps("2025-08-01")).not.toContain("anubis");
    expect(isActiveDuty("cache", "2026-07-08")).toBe(true);
    expect(isActiveDuty("overpass", "2026-07-08")).toBe(false);
    expect(isActiveDuty("cache", "2026-07-07")).toBe(false);
  });

  it("normalizes real map identifiers", () => {
    expect(normalizeMapCode("de_dust2")).toBe("dust2");
    expect(normalizeMapCode("Dust 2")).toBe("dust2");
    expect(normalizeMapCode("Dust II")).toBe("dust2");
    expect(normalizeMapCode("de_mirage")).toBe("mirage");
    expect(normalizeMapCode("de_cache")).toBe("cache");
    expect(normalizeMapCode("de_overpass")).toBe("overpass");
    expect(normalizeMapCode("de_train")).toBe("train");
    expect(normalizeMapCode("cs_office")).toBe("office");
    expect(normalizeMapCode("de_unknownmap")).toBeNull();
    expect(normalizeMapCode(null)).toBeNull();
  });

  it("never invents a map name and never invents pool membership", () => {
    expect(mapDisplayName(null)).toBe("—");
    expect(mapDisplayName("de_cache")).toBe("Cache");
    expect(mapPoolStatus("de_unknownmap")).toBe("unknown");
    expect(mapPoolStatus("overpass", "2026-08-01")).toBe("out_of_pool");
    expect(mapPoolStatus("overpass", "2026-02-01")).toBe("active_duty");
  });
});
