/**
 * The signed-in user's real account row (`profiles`), read through RLS.
 * Only fields the account itself owns are exposed to the UI.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface Account {
  id: string;
  email: string | null;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  country: string | null;
  locale: string;
  role: string;
  status: string;
}

export function useAccount() {
  return useQuery<Account | null>({
    queryKey: ["account", "self"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, nickname, avatar_url, country, locale, role, status")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) return null;
      return data as Account;
    },
    staleTime: 60_000,
    retry: false,
  });
}
