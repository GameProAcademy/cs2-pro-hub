/**
 * Regression guard for the runtime error
 * "useI18n must be used inside <I18nProvider>".
 *
 * Two failure modes are covered:
 *  1. A consumer rendered under the provider must resolve the context
 *     (fails if the context module is duplicated or the provider is bypassed).
 *  2. The single global provider must stay in the root route around <Outlet />,
 *     imported through the same "@/i18n" specifier every consumer uses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider, useT, useI18n } from "@/i18n";

const root = process.cwd();

function Consumer() {
  const t = useT();
  const { locale } = useI18n();
  return <span data-locale={locale}>{t("login.title")}</span>;
}

describe("i18n provider tree", () => {
  it("resolves the context for consumers rendered under the provider", () => {
    const html = renderToString(
      <I18nProvider>
        <Consumer />
      </I18nProvider>,
    );
    expect(html).toContain("data-locale");
    expect(html).not.toContain("must be used inside");
  });

  it("throws only when the provider is genuinely absent", () => {
    expect(() => renderToString(<Consumer />)).toThrow(/useI18n must be used inside/);
  });

  it("keeps a single global provider in the root route wrapping <Outlet />", () => {
    const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
    expect(rootRoute).toMatch(/from "@\/i18n"/);
    expect(rootRoute).toMatch(/<I18nProvider>[\s\S]*<Outlet \/>[\s\S]*<\/I18nProvider>/);
  });

  it("declares I18nContext exactly once in the codebase", () => {
    const source = readFileSync(join(root, "src/i18n/index.tsx"), "utf8");
    expect(source.match(/createContext</g)).toHaveLength(1);
  });
});
