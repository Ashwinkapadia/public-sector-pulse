import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vertical {
  id: string;
  name: string;
  description: string | null;
}

export const useVerticals = () => {
  return useQuery({
    queryKey: ["verticals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verticals")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as Vertical[];
    },
  });
};
