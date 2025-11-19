import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Organization {
  id: string;
  name: string;
  state: string;
  last_updated: string | null;
}

interface Vertical {
  id: string;
  name: string;
  description: string | null;
}

interface FundingRecord {
  id: string;
  organization_id: string;
  vertical_id: string;
  amount: number;
  status: string;
  fiscal_year: number;
  date_range_start: string | null;
  date_range_end: string | null;
  notes: string | null;
  grant_type_id: string | null;
  cfda_code: string | null;
  organizations: Organization;
  verticals: Vertical;
  grant_types?: {
    id: string;
    name: string;
    description: string | null;
    federal_agency: string | null;
    cfda_code: string | null;
  } | null;
}

export function useOrganizations(state?: string) {
  return useQuery({
    queryKey: ["organizations", state],
    queryFn: async () => {
      let query = supabase
        .from("organizations")
        .select("*")
        .order("name");

      if (state) {
        query = query.eq("state", state);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Organization[];
    },
  });
}

export function useVerticals() {
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
}

export function useFundingRecords(state?: string, startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["funding_records", state, startDate, endDate],
    queryFn: async () => {
      // First get organization IDs for the selected state
      let orgIds: string[] | undefined;
      if (state) {
        const { data: orgs, error: orgError } = await supabase
          .from("organizations")
          .select("id")
          .eq("state", state);
        
        if (orgError) throw orgError;
        orgIds = orgs.map(org => org.id);
        
        // If no organizations found for this state, return empty array
        if (orgIds.length === 0) return [];
      }

      // Build the main query
      let query = supabase
        .from("funding_records")
        .select(`
          *,
          organizations (*),
          verticals (*),
          grant_types (*)
        `)
        .order("created_at", { ascending: false });

      // Filter by organization IDs if state was selected
      if (orgIds) {
        query = query.in("organization_id", orgIds);
      }

      if (startDate) {
        query = query.gte("date_range_start", startDate.toISOString().split("T")[0]);
      }

      if (endDate) {
        query = query.lte("date_range_end", endDate.toISOString().split("T")[0]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FundingRecord[];
    },
  });
}

export function useFundingMetrics(state?: string) {
  return useQuery({
    queryKey: ["funding_metrics", state],
    queryFn: async () => {
      let orgQuery = supabase.from("organizations").select("id", { count: "exact", head: true });

      if (state) {
        orgQuery = orgQuery.eq("state", state);
      }

      const { count: orgCount, data: orgs } = await orgQuery;
      
      // Get funding data for these organizations
      let fundingQuery = supabase.from("funding_records").select("amount");
      
      if (state && orgs) {
        const orgIds = orgs.map(org => org.id);
        if (orgIds.length === 0) {
          return {
            totalOrganizations: 0,
            totalFunding: 0,
            avgFunding: 0,
            activePrograms: 0,
          };
        }
        fundingQuery = fundingQuery.in("organization_id", orgIds);
      }

      const { data: fundingData } = await fundingQuery;

      const totalFunding = fundingData?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;
      const avgFunding = orgCount && orgCount > 0 ? totalFunding / orgCount : 0;

      return {
        totalOrganizations: orgCount || 0,
        totalFunding,
        avgFunding,
        activePrograms: orgCount || 0,
      };
    },
  });
}
