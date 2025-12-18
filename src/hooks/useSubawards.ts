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

export function useSubawardsByState(state?: string, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["subawards-by-state", state, startDate, endDate],
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
            fiscal_year,
            action_date
          )
        `)
        .order("amount", { ascending: false });

      if (state && state !== "ALL") {
        query = query.eq("recipient_organization.state", state);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Filter by award_date of the subaward itself (not the parent funding_record)
      let filteredData = data as Subaward[];
      
      if (startDate || endDate) {
        filteredData = filteredData.filter((subaward: any) => {
          // Use subaward's own award_date for filtering
          const awardDate = subaward.award_date;
          if (!awardDate) return true; // Include subawards without dates
          
          const date = new Date(awardDate);
          if (startDate && date < startDate) return false;
          if (endDate && date > endDate) return false;
          
          return true;
        });
      }
      
      return filteredData;
    },
  });
}
