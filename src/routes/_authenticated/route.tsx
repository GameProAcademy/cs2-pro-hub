import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { fetchAccountStatus } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    // Deactivated accounts lose application access; the session is ended here.
    const status = await fetchAccountStatus(data.user.id);
    if (status === "inactive") {
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
