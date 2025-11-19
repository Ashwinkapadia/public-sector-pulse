import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProgramModel {
  id: string;
  name: string;
  description: string | null;
  model_type: string | null;
  created_at: string;
}

export const useProgramModels = () => {
  return useQuery({
    queryKey: ["program-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_models")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as ProgramModel[];
    },
  });
};

export const useFundingRecordProgramModels = (fundingRecordId?: string) => {
  return useQuery({
    queryKey: ["funding-record-program-models", fundingRecordId],
    queryFn: async () => {
      if (!fundingRecordId) return [];
      
      const { data, error } = await supabase
        .from("funding_record_program_models")
        .select(`
          id,
          program_model:program_models (
            id,
            name,
            description,
            model_type
          )
        `)
        .eq("funding_record_id", fundingRecordId);

      if (error) throw error;
      return data;
    },
    enabled: !!fundingRecordId,
  });
};
