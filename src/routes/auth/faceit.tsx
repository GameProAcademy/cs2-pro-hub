import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LoadingState } from "@/components/common/States";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useT } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { fetchAccountStatus, touchLastLogin } from "@/lib/auth";
import { parseFaceitHandover } from "@/lib/faceit/faceitLogin";

/**
 * PM5 — end of "Continue with FACEIT". The server callback put a one-time session token hash in
 * the URL FRAGMENT (never sent to a server or logged); it is removed from the address bar at
 * once and exchanged for a session with `verifyOtp`. The same active-account check as the
 * password login applies.
 */
export const Route = createFileRoute("/auth/faceit")({
  head: () => ({ meta: [{ title: "FACEIT — CS2 PRO AI COACH" }] }),
  component: FaceitHandoverPage,
});

function FaceitHandoverPage() {
  const t = useT();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const handover = parseFaceitHandover(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    const fail = () => navigate({ to: "/login", search: { faceit: "failed" }, replace: true });
    if (!handover) {
      fail();
      return;
    }
    void (async () => {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: handover.tokenHash,
        type: "magiclink",
      });
      if (error || !data.user) return fail();
      if ((await fetchAccountStatus(data.user.id)) !== "active") {
        await supabase.auth.signOut();
        return fail();
      }
      await touchLastLogin();
      // A new account lands on the FACEIT card (/profile), where the first sync shows.
      if (handover.created)
        navigate({
          to: "/profile",
          search: { connection: "faceit_success" } as never,
          replace: true,
        });
      else navigate({ to: "/dashboard", replace: true });
    })();
  }, [navigate]);

  return (
    <AuthLayout title={t("login.faceit.signingIn")} subtitle={t("login.faceit.signingInSubtitle")}>
      <LoadingState />
    </AuthLayout>
  );
}
