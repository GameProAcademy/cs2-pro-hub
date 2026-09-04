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
  it("versions are ordered and dated", () => {
    const dates = CS2_MAP_POOL_VERSIONS.map((v) => new Date(v.effectiveFrom).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(CS2_MAP_POOL_VERSIONS.every((v) => v.activeDuty.length === 7)).toBe(true);
  });

  it("resolves the pool active at a past date", () => {
    const pool = resolveMapPool("2024-01-01");
    expect(pool.version).toBe(1);
    expect(pool.activeDuty).toContain("overpass");
    expect(pool.activeDuty).not.toContain("cache");
  });

  it("Cache is Active Duty and Overpass is out from 2026-07-08", () => {
    expect(isActiveDuty("cache", "2026-07-08")).toBe(true);
    expect(isActiveDuty("overpass", "2026-07-08")).toBe(false);
    expect(isActiveDuty("cache", "2026-07-07")).toBe(false);
    expect(CURRENT_MAP_POOL_VERSION.activeDuty).toEqual(activeDutyMaps("2026-12-01"));
  });

  it("normalizes real map identifiers", () => {
    expect(normalizeMapCode("de_dust2")).toBe("dust2");
    expect(normalizeMapCode("Dust II")).toBe("dust2");
    expect(normalizeMapCode("de_mirage")).toBe("mirage");
    expect(normalizeMapCode("cs_office")).toBe("office");
    expect(normalizeMapCode("de_unknownmap")).toBeNull();
    expect(normalizeMapCode(null)).toBeNull();
  });

  it("never invents a map name and never invents pool membership", () => {
    expect(mapDisplayName(null)).toBe("—");
    expect(mapDisplayName("de_cache")).toBe("Cache");
    expect(mapPoolStatus("de_unknownmap")).toBe("unknown");
    expect(mapPoolStatus("overpass", "2026-08-01")).toBe("out_of_pool");
  });
});
