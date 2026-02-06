import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildAwardDateOrFilter } from "@/hooks/funding/dateRangeFilter";
import { format } from "date-fns";

function toDateKey(d?: Date) {
  // Use a stable YYYY-MM-DD key (avoid Date objects in query keys).
  // This ensures TanStack Query reliably treats date changes as distinct queries.
  return d ? format(d, "yyyy-MM-dd") : undefined;
}

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
  source: string;
  action_date: string | null;
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

      if (state && state !== "ALL") {
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

export function useFundingRecords(
  state?: string,
  startDate?: Date,
  endDate?: Date,
  verticalIds?: string[]
) {
  // Compute stable date strings for query key and debugging
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  const verticalsKey = verticalIds?.join(",") || "";

  // Only enable the query when at least one filter is set to avoid showing all data
  // This prevents the "undefined filters" race condition after cache purges
  const hasFilters = Boolean(state) || Boolean(startDate) || Boolean(endDate) || (verticalIds && verticalIds.length > 0);

  return useQuery({
    queryKey: ["funding_records", state, startKey, endKey, verticalsKey],
    // Never serve stale cached data; always fetch fresh when filters change
    staleTime: 0,
    refetchOnMount: "always",
    // Disable query until user sets at least one filter
    enabled: hasFilters,
    queryFn: async () => {
      console.log("[useFundingRecords] Fetching", { state, startKey, endKey, verticalsKey });
      // Build the main query - include source field explicitly
      let query = supabase
        .from("funding_records")
        .select(`
          id,
          organization_id,
          vertical_id,
          amount,
          status,
          fiscal_year,
          date_range_start,
          date_range_end,
          notes,
          grant_type_id,
          cfda_code,
          source,
          action_date,
          organizations!inner (*),
          verticals (*),
          grant_types (*)
        `)
        .order("created_at", { ascending: false });

      // Filter by state via inner join (prevents huge `in()` lists and guarantees state is applied)
      if (state && state !== "ALL") {
        query = query.eq("organizations.state", state);
      }

      // Filter by action_date (when grant was awarded)
      // IMPORTANT: build a single OR filter string so we don't override conditions.
      // This handles both USAspending (has action_date) and Grants.gov/legacy records.
      const dateOrFilter = buildAwardDateOrFilter({ start: startDate, end: endDate });
      console.log("[useFundingRecords] dateOrFilter:", dateOrFilter);
      if (dateOrFilter) query = query.or(dateOrFilter);

      // Filter by verticals (server-side) when specified
      if (verticalIds && verticalIds.length > 0) {
        query = query.in("vertical_id", verticalIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as FundingRecord[];
    },
  });
}

export function useFundingMetrics(
  state?: string,
  startDate?: Date,
  endDate?: Date,
  verticalIds?: string[]
) {
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  const verticalsKey = verticalIds?.join(",") || "";

  // Only enable the query when at least one filter is set
  const hasFilters = Boolean(state) || Boolean(startDate) || Boolean(endDate) || (verticalIds && verticalIds.length > 0);

  return useQuery({
    queryKey: ["funding_metrics", state, startKey, endKey, verticalsKey],
    staleTime: 0,
    refetchOnMount: "always",
    // Disable query until user sets at least one filter
    enabled: hasFilters,
    queryFn: async () => {
      console.log("[useFundingMetrics] Fetching", { state, startKey, endKey, verticalsKey });
      // Get funding data with date filters. Filter by state via inner join so state is always enforced.
      let fundingQuery = supabase
        .from("funding_records")
        .select("organization_id, amount, vertical_id, organizations!inner(state)");

      if (state && state !== "ALL") {
        fundingQuery = fundingQuery.eq("organizations.state", state);
      }

      // Filter by action_date (when grant was awarded) with fallback to date_range_start
      const dateOrFilter = buildAwardDateOrFilter({ start: startDate, end: endDate });
      console.log("[useFundingMetrics] dateOrFilter:", dateOrFilter);
      if (dateOrFilter) fundingQuery = fundingQuery.or(dateOrFilter);

      // Filter by verticals if specified
      if (verticalIds && verticalIds.length > 0) {
        fundingQuery = fundingQuery.in("vertical_id", verticalIds);
      }

      const { data: fundingData } = await fundingQuery;

      console.log('Funding Metrics Debug:', {
        state,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        fundingRecordsCount: fundingData?.length,
      });

      // Count unique organizations that have funding records in the date range
      const uniqueOrgIds = new Set(fundingData?.map(record => record.organization_id) || []);
      const orgCount = uniqueOrgIds.size;

      console.log('Unique org count:', orgCount);

      const totalFunding = fundingData?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;
      const avgFunding = orgCount > 0 ? totalFunding / orgCount : 0;

      return {
        totalOrganizations: orgCount,
        totalFunding,
        avgFunding,
        activePrograms: orgCount,
      };
    },
  });
}
