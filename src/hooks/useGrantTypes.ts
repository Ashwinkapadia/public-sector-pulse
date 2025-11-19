import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GrantType {
  id: string;
  name: string;
  description: string | null;
  federal_agency: string | null;
  created_at: string;
}

export const useGrantTypes = () => {
  return useQuery({
    queryKey: ["grant-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grant_types")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as GrantType[];
    },
  });
};
