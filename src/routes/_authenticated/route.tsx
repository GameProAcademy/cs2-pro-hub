import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { fetchAccountStatus } from "@/lib/auth";

/**
 * Authenticated gate. The session can only be read in the browser, so the
 * subtree is client-rendered (`ssr: false`).
 *
 * The decision is taken in `beforeLoad` (fail-closed), but the NAVIGATION away
 * happens after the first client render. Throwing a redirect during
 * `beforeLoad` swaps the rendered route while React is still hydrating the
 * server markup, which React reports as a hydration mismatch. Rendering
 * nothing and navigating from an effect keeps the first client render aligned
 * with the server output while remaining just as closed: children are never
 * rendered without an active, active-status session.
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
  const navigate = useNavigate();

  useEffect(() => {
    if (user) return;
    // Deferred by a macrotask: navigating synchronously inside the first effect
    // reenters the router while it is still mounting the matched route.
    const timer = setTimeout(() => void navigate({ to: "/login", replace: true }), 120);
    return () => clearTimeout(timer);
  }, [user, navigate]);

  if (!user) return null;
  return <Outlet />;
}
