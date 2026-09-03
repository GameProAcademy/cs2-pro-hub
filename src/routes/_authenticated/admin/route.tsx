import { Outlet, createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import { ErrorState } from "@/components/common/States";
import { useT } from "@/i18n";
import { getAdminSession } from "@/lib/admin.functions";

/**
 * Administrative gate. Authorisation is resolved server-side (session +
 * profile + authoritative `admin_master` role) and is fail-closed.
 *
 * Three outcomes are handled explicitly so the area can never render a blank
 * screen:
 *  - no session -> /login (handled by the parent authenticated gate too);
 *  - authenticated but not administrator -> /dashboard;
 *  - authorisation could not be determined -> controlled error screen.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    let session: Awaited<ReturnType<typeof getAdminSession>> | null = null;

    try {
      session = await getAdminSession();
    } catch (error) {
      if (isRedirect(error)) throw error;

      const message = error instanceof Error ? error.message : String(error);

      // Session missing/expired: back to the public login route.
      if (/unauthorized|401/i.test(message)) throw redirect({ to: "/login" });

      // Explicit denial: the user is signed in but is not the administrator.
      if (message.includes("ADMIN_FORBIDDEN")) throw redirect({ to: "/dashboard" });

      // Anything else is an unexpected backend failure: surface a controlled
      // error state instead of a silent redirect. No internal detail is shown.
      throw new Error("ADMIN_UNAVAILABLE");
    }

    if (!session?.userId) throw redirect({ to: "/dashboard" });
    return { adminSession: session };
  },
  errorComponent: AdminErrorScreen,
  component: () => <Outlet />,
});

function AdminErrorScreen() {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <ErrorState title={t("admin.error.title")} description={t("admin.error.unexpected")} />
    </div>
  );
}
