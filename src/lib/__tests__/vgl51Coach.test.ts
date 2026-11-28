/** VGL 5.1 — Frente 10: Coach page layout (presentation only; provider/model/prompts untouched). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const page = read("src/routes/_authenticated/coach.tsx");
const chat = read("src/components/coach/RealCoachChat.tsx");
const controls = read("src/components/coach/CoachControls.tsx");

describe("Coach page", () => {
  it("one title, 'Treinador CS2 PRO', with an explanatory tooltip beside it", () => {
    const real = page.slice(
      page.indexOf("function RealCoachPage"),
      page.indexOf("const contextItems"),
    );
    expect(real).toContain('title={t("vgl51.coach.title")}');
    expect(real).toMatch(/titleAddon=\{\s*<InfoTip/);
    expect(real).not.toContain('t("coach.title")');
  });

  it("the chat top bar has no title nor 'delete conversation' on the page; desktop hides the bar", () => {
    expect(chat).toContain('layout === "page" && "py-1.5 lg:hidden"');
    expect(chat).toContain(
      'className={cn("min-w-0 flex-1 max-sm:contents", layout === "page" && "hidden")}',
    );
    expect(chat).toMatch(/\{layout === "drawer" \? \(\s*<DeleteConversationButton/);
  });

  it("Personalizar sits under Nova conversa in the sidebar; per-conversation delete stays two-step", () => {
    const sidebar = controls.slice(controls.indexOf("export function ConversationSidebar"));
    expect(sidebar.indexOf("data-coach-sidebar-new")).toBeLessThan(
      sidebar.indexOf("data-coach-sidebar-personalize"),
    );
    expect(chat).toContain(
      "onPersonalize={prefsAvailable ? () => setShowPrefs((v) => !v) : undefined}",
    );
    expect(sidebar).toContain("data-coach-sidebar-confirm");
  });

  it("avatars: the Coach uses the side-menu icon (Bot); the player uses their own profile photo", () => {
    expect(read("src/config/navigation.ts")).toMatch(/to: "\/coach", icon: Bot/);
    expect(chat).toMatch(/data-coach-avatar="coach"[\s\S]{0,80}<Bot /);
    expect(chat).toMatch(/<UserAvatar\s+source=\{account\?\.avatar_url \?\? null\}/);
    expect(chat).not.toMatch(/<User className/);
  });

  it("more reading width on the page; engine files untouched by this front", () => {
    expect(chat).toContain('layout === "page" ? "max-w-5xl" : "max-w-4xl"');
    expect(chat).toContain("min-w-0 max-w-full flex-1 overflow-hidden rounded-lg");
    expect(chat).not.toContain("max-w-[min(100%,46rem)]");
  });

  it("new texts exist in the five languages", () => {
    for (const l of ["pt-BR", "en", "es", "fr", "pt-PT"]) {
      const b = read(`src/i18n/locales/vgl5/${l}.ts`);
      for (const k of [
        "vgl51.coach.title",
        "vgl51.coach.tip",
        "vgl51.coach.tipLabel",
        "vgl51.coach.you",
      ])
        expect(b).toContain(`"${k}"`);
    }
  });
});
