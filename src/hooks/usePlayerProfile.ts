/**
 * Real profile state. The query is the single source of truth for the profile
 * page and for the verification meter — there is no demo fallback.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getPlayerProfile,
  savePlayerProfile,
  type PlayerProfilePayload,
  type SavePlayerProfileInput,
} from "@/lib/profile.functions";

export const playerProfileKey = ["player-profile", "self"] as const;

export function usePlayerProfile() {
  const fetchProfile = useServerFn(getPlayerProfile);
  return useQuery<PlayerProfilePayload>({
    queryKey: playerProfileKey,
    queryFn: () => fetchProfile(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSavePlayerProfile() {
  const queryClient = useQueryClient();
  const save = useServerFn(savePlayerProfile);
  return useMutation({
    mutationFn: (input: SavePlayerProfileInput) => save({ data: input }),
    onSuccess: (payload) => {
      queryClient.setQueryData(playerProfileKey, payload);
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });
}
