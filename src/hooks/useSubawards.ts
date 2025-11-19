import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Subaward {
  id: string;
  funding_record_id: string;
  recipient_organization_id: string;
  amount: number;
  description?: string;
  award_date?: string;
  created_at: string;
  updated_at: string;
  recipient_organization?: {
    id: string;
    name: string;
    state: string;
    city?: string;
  };
}

export function useSubawards(fundingRecordId?: string) {
  return useQuery({
    queryKey: ["subawards", fundingRecordId],
    queryFn: async () => {
      let query = supabase
        .from("subawards")
        .select(`
          *,
          recipient_organization:organizations!recipient_organization_id(
            id,
            name,
            state,
            city
          )
        `)
        .order("amount", { ascending: false });

      if (fundingRecordId) {
        query = query.eq("funding_record_id", fundingRecordId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Subaward[];
    },
    enabled: !!fundingRecordId,
  });
}

export function useSubawardsByState(state?: string) {
  return useQuery({
    queryKey: ["subawards-by-state", state],
    queryFn: async () => {
      let query = supabase
        .from("subawards")
        .select(`
          *,
          recipient_organization:organizations!recipient_organization_id(
            id,
            name,
            state,
            city
          ),
          funding_record:funding_records!funding_record_id(
            id,
            organization_id,
            source,
            fiscal_year
          )
        `)
        .order("amount", { ascending: false });

      if (state) {
        query = query.eq("recipient_organization.state", state);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Subaward[];
    },
  });
}
