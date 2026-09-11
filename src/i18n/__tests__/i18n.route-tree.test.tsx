/**
 * Route-tree regression test for "useI18n must be used inside <I18nProvider>".
 *
 * This builds a REAL TanStack Router tree (memory history, root route with a
 * shellComponent that provides i18n, child route rendered through <Outlet />)
 * and asserts that a route component calling useT() resolves the context.
 *
 * Limitation: the app's own src/routes/__root.tsx cannot be imported here
 * because it pulls in `styles.css?url` and the Supabase browser client, which
 * are not available in the Vitest environment. The tree below mirrors its
 * structure exactly (shell -> providers -> RootComponent -> Outlet -> route),
 * and a structural assertion below pins the real file to that shape.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider, useT } from "@/i18n";

function Shell({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

const rootRoute = createRootRoute({
  shellComponent: Shell,
  component: () => <Outlet />,
});

function LoginLikePage() {
  const t = useT();
  return <p data-testid="login-title">{t("login.title")}</p>;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginLikePage,
});

describe("i18n through the real router tree", () => {
  it("renders a route component that calls useT() without throwing", async () => {
    const router = createRouter({
      routeTree: rootRoute.addChildren([loginRoute]),
      history: createMemoryHistory({ initialEntries: ["/login"] }),
    });
    await router.load();

    const html = renderToString(<RouterProvider router={router} />);
    expect(html).toContain("login-title");
    expect(html).not.toContain("must be used inside");
  });

  it("keeps the single global provider in the root shell, above every branch", () => {
    const source = readFileSync(join(process.cwd(), "src/routes/__root.tsx"), "utf8");
    expect(source).toMatch(/from "@\/i18n"/);
    // Provider wraps the shell children (RootComponent + error/not-found branches).
    expect(source).toMatch(/<I18nProvider>\{children\}<\/I18nProvider>/);
    // Exactly one provider usage in the root route.
    expect(source.match(/<I18nProvider>/g)).toHaveLength(1);
  });
});
