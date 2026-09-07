import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { fetchAccountStatus } from "@/lib/auth";

/**
 * Authenticated gate. The session can only be read in the browser, so the
 * subtree is client-rendered (`ssr: false`).
 *
 * The decision is taken in `beforeLoad` (fail-closed), but the NAVIGATION away
 * happens during render, through `<Navigate>`. Throwing a redirect from
 * `beforeLoad` swaps the rendered route while React is still hydrating the
 * server markup (hydration mismatch), and navigating from an effect can update
 * a component the router has already unmounted ("state update on a component
 * that hasn't mounted yet"). Declarative navigation avoids both while staying
 * just as closed: children are never rendered without an active session whose
 * account status is `active`.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { user: null };

    // Fail-closed: a valid session is not enough. The profile must exist and
    // be confirmed active, otherwise the session is ended.
    const status = await fetchAccountStatus(data.user.id);
    if (status !== "active") {
      await supabase.auth.signOut();
      return { user: null };
    }

    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
