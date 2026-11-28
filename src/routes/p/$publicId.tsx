import { createFileRoute } from "@tanstack/react-router";

import { PublicProfilePage } from "@/components/publicProfile/PublicProfileView";
import { normalizePublicId } from "@/lib/publicProfile/publicProfile";

/** VGL 5.0 — public player profile (no session needed). `?vs=` compares with another public id. */
export const Route = createFileRoute("/p/$publicId")({
  head: () => ({
    meta: [{ title: "Perfil público — CS2 PRO AI COACH" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): { vs?: string } => {
    const vs = normalizePublicId(search["vs"]);
    return vs ? { vs } : {};
  },
  component: PublicProfileRoute,
});

function PublicProfileRoute() {
  const { publicId } = Route.useParams();
  const { vs } = Route.useSearch();
  return <PublicProfilePage publicId={publicId} vs={vs} />;
}
