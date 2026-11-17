/**
 * Security regression — credentials must never travel in a URL (run 44035115612: a native GET on
 * /login before hydration put email and password in the query string). The server-rendered markup is
 * what the browser can submit before React hydrates, so it is asserted directly here; the browser
 * behaviour (JavaScript disabled, delayed hydration, after hydration) is covered by
 * e2e/auth-forms.e2e.ts.
 */
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeForm } from "@/components/common/SafeForm";

const html = (children: ReactNode = null) =>
  renderToString(
    <SafeForm className="space-y-4" onSubmit={() => undefined}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit">go</button>
      {children}
    </SafeForm>,
  );

describe("SafeForm (server-rendered, before hydration)", () => {
  it("is a POST form, so a native submission can never build a query string", () => {
    expect(html()).toMatch(/<form[^>]*method="post"/);
    expect(html()).not.toMatch(/<form[^>]*method="get"/i);
    expect(html()).not.toMatch(/<form[^>]*action=/);
  });

  it("keeps every control inside a disabled fieldset until React hydrates", () => {
    // A disabled fieldset disables its inputs and its submit button: no click and no Enter
    // (implicit submission) can submit before the app's handler exists.
    expect(html()).toMatch(
      /<form[^>]*>\s*<fieldset disabled=""[^>]*>[\s\S]*<button type="submit">/,
    );
  });

  it("exposes the hydration state for tests", () => {
    expect(html()).toMatch(/<form[^>]*data-hydrated="false"/);
  });

  it("keeps the caller's layout classes on the content wrapper", () => {
    expect(html()).toMatch(/<fieldset[^>]*class="m-0 min-w-0 border-0 p-0 space-y-4"/);
  });
});
