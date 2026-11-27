/**
 * Visual Game Language — profile, notifications, admin and upload decisions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/notificationEvents";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("account screens (VGL)", () => {
  it("every notification category has a pictogram; failures use the alert in attention tone", () => {
    const n = src("src/components/notifications/NotificationComponents.tsx");
    for (const c of NOTIFICATION_CATEGORIES) expect(n).toMatch(new RegExp(`\\b${c}: "`));
    expect(n).toContain('failed={n.type === "demo_failed"}');
    // Hidden on phones: the mobile baseline of the list is unchanged.
    expect(n).toContain(
      '"hidden size-9 shrink-0 items-center justify-center rounded-lg border sm:flex"',
    );
  });

  it("profile adds the map pool only when there is an identified map (no empty cell)", () => {
    const p = src("src/routes/_authenticated/profile.tsx");
    expect(p).toContain("mapPool(q.data.matches).entries.length === 0) return null;");
  });

  it("admin screens keep the shared header and no free colours", () => {
    for (const f of [
      "index",
      "users",
      "catalog",
      "audit",
      "pipeline",
      "notifications",
      "demo-e2e",
      "memory-lab",
      "r5-forensic",
    ]) {
      const a = src(`src/routes/_authenticated/admin/${f}.tsx`);
      expect(a, f).toContain("PageHeader");
      expect(a, f).not.toMatch(/text-(green|red|yellow|amber|blue)-\d/);
    }
  });
});
