/**
 * VGL 5.0 — Frente 5 (one active item, never colour alone) and Frente 6 (Coach: sidebar on
 * desktop /coach, dropdown on phones, floating chat's "Conversations" opens /coach).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { activeSectionOf, areaOf, isOnPath, navAreas } from "@/config/navigation";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("activeSectionOf", () => {
  it("one section per page, child routes included", () => {
    expect(activeSectionOf("/matches")).toBe("/matches");
    expect(activeSectionOf("/matches/0f8c6b8e-1111-4a2b-9c3d-123456789abc")).toBe("/matches");
    expect(activeSectionOf("/moments")).toBe("/moments");
    expect(activeSectionOf("/player-dna")).toBe("/player-dna");
    expect(activeSectionOf("/maps")).toBe("/maps");
    expect(activeSectionOf("/goals")).toBe("/goals");
  });
  it("area pages without their own section fall under the area's first section", () => {
    expect(activeSectionOf("/rounds")).toBe("/matches");
    expect(activeSectionOf("/deaths")).toBe("/matches");
  });
  it("one-page areas and account pages have no section", () => {
    expect(activeSectionOf("/dashboard")).toBeNull();
    expect(activeSectionOf("/coach")).toBeNull();
    expect(activeSectionOf("/profile")).toBeNull();
    expect(areaOf("/profile")).toBeNull();
    expect(isOnPath("/profile", "/profile")).toBe(true);
    expect(isOnPath("/profiles", "/profile")).toBe(false);
  });
  it("every section of every area resolves to itself (never two at once)", () => {
    for (const area of navAreas)
      for (const sec of area.sections ?? []) expect(activeSectionOf(sec.to)).toBe(sec.to);
  });
  it("active state is never colour alone: surface, side bar, weight and aria-current", () => {
    const shell = read("src/components/layout/AppShell.tsx");
    expect(shell).toContain("shadow-[inset_3px_0_0_0_var(--primary)]");
    expect(shell).toContain("font-semibold");
    expect(shell).toContain('aria-current={on ? "page" : undefined}');
    expect(shell).not.toContain("activeOptions={{ exact: false }}");
  });
});

describe("AI Coach layouts", () => {
  const chat = read("src/components/coach/RealCoachChat.tsx");
  const controls = read("src/components/coach/CoachControls.tsx");
  it("/coach uses the page layout and accepts the conversation to open", () => {
    const route = read("src/routes/_authenticated/coach.tsx");
    expect(route).toContain('layout="page"');
    expect(route).toContain("initialConversationId={conversation}");
    expect(route).toContain("z.string().uuid()");
  });
  it("sidebar only from lg; the dropdown stays below lg", () => {
    expect(chat).toContain('<div className="hidden min-h-0 lg:flex">');
    expect(chat).toContain('<div className="lg:hidden">\n            <ConversationMenu');
  });
  it("floating chat on desktop: Conversations links to /coach with the current conversation", () => {
    expect(chat).toContain('className="hidden lg:inline-flex"');
    expect(chat).toContain("search={conversationId ? { conversation: conversationId } : {}}");
  });
  it("delete shows on hover and keyboard focus, and still asks before deleting", () => {
    expect(controls).toContain("group-hover:opacity-100 group-focus-within:opacity-100");
    expect(controls).toContain("focus-visible:opacity-100");
    expect(controls).toContain("data-coach-sidebar-confirm");
    // The server call happens only in the confirm handler.
    const sidebar = controls.slice(controls.indexOf("export function ConversationSidebar"));
    expect(sidebar.indexOf("deleteCoachConversation")).toBeLessThan(
      sidebar.indexOf("data-coach-sidebar-confirm"),
    );
    expect(sidebar).toContain("onClick={() => void remove(c.id)}");
  });
});
