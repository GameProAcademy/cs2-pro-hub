import { Navigate, Outlet, createFileRoute, isRedirect } from "@tanstack/react-router";

import { ErrorState } from "@/components/common/States";
import { useT } from "@/i18n";
import { getAdminSession } from "@/lib/admin.functions";

type AdminSessionContext = Awaited<ReturnType<typeof getAdminSession>>;

interface AdminGate {
  gate: "ok" | "signin" | "forbidden";
  /**
   * Only meaningful when `gate === "ok"`. On the denial gates the children are
   * never rendered (the component navigates away instead), so no descendant can
   * observe this value — it is typed non-nullable purely so authorised screens
   * do not have to re-narrow an impossible null.
   */
  adminSession: AdminSessionContext;
}

/** Denial gates never render children; see `adminSession` above. */
const NO_ADMIN_SESSION = null as unknown as AdminSessionContext;

/**
 * Administrative gate. Authorisation is resolved server-side (session +
 * profile + authoritative `admin_master` role) and is fail-closed.
 *
 * Three outcomes are handled explicitly so the area can never render a blank
 * screen:
 *  - no session -> /login;
 *  - authenticated but not administrator -> /dashboard;
 *  - authorisation could not be determined -> controlled error screen.
 *
 * The outcome is DECIDED here and NAVIGATED declaratively in the component:
 * throwing a redirect from `beforeLoad` swaps the rendered route while React is
 * still hydrating, which React reports as a hydration mismatch.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }): Promise<AdminGate> => {
    // FASE 2.6.11.5 — the parent gate already resolved the browser session.
    // Calling an authenticated server function with no session would send a
    // request with no Authorization header, which the middleware correctly
    // rejects as `Unauthorized` — surfacing an application error for what is
    // simply "not signed in". The absence of a session is answered here, and
    // authorisation itself is still decided server-side below.
    if (!(context as { user?: { id: string } | null }).user) {
      return { gate: "signin", adminSession: NO_ADMIN_SESSION };
    }

    try {
      const session = await getAdminSession();
      if (!session?.userId) return { gate: "forbidden", adminSession: NO_ADMIN_SESSION };
      return { gate: "ok", adminSession: session };
    } catch (error) {
      if (isRedirect(error)) throw error;

      const message = error instanceof Error ? error.message : String(error);

      // Session missing/expired: back to the public login route.
      if (/unauthorized|401/i.test(message))
        return { gate: "signin", adminSession: NO_ADMIN_SESSION };

      // Explicit denial: the user is signed in but is not the administrator.
      if (message.includes("ADMIN_FORBIDDEN"))
        return { gate: "forbidden", adminSession: NO_ADMIN_SESSION };

      // Anything else is an unexpected backend failure: surface a controlled
      // error state instead of a silent redirect. No internal detail is shown.
      throw new Error("ADMIN_UNAVAILABLE");
    }
  },
  errorComponent: AdminErrorScreen,
  component: AdminGateComponent,
});

function AdminGateComponent() {
  const { gate } = Route.useRouteContext() as AdminGate;
  if (gate === "signin") return <Navigate to="/login" replace />;
  if (gate === "forbidden") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function AdminErrorScreen() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <ErrorState title={t("admin.error.title")} description={t("admin.error.unexpected")} />
    </div>
  );
}
