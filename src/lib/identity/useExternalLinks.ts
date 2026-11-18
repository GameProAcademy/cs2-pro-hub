import { useQuery, type QueryClient } from "@tanstack/react-query";

import type { ExternalLinkView } from "./externalLinks";
import { getMyExternalLinks } from "./externalLinks.functions";

export const EXTERNAL_LINKS_KEY = ["identity", "links"] as const;

export function useExternalLinks() {
  return useQuery<ExternalLinkView[]>({
    queryKey: EXTERNAL_LINKS_KEY,
    queryFn: () => getMyExternalLinks(),
  });
}

/** Every link mutation (connect, sync, unlink) refreshes every screen at once. */
export function invalidateExternalLinks(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: EXTERNAL_LINKS_KEY });
  void queryClient.invalidateQueries({ queryKey: ["steam", "connection"] });
  void queryClient.invalidateQueries({ queryKey: ["faceit", "connection"] });
  void queryClient.invalidateQueries({ queryKey: ["player", "profile"] });
}
