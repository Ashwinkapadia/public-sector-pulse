import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Agency, AGENCIES } from "@/components/AgencyMultiSelect";
import { getBaseFilters, SUB_AWARD_FIELDS } from "@/lib/usaspendingFilters";

export interface SubAwardResult {
  subAwardId: string;
  subRecipient: string;
  primeAwardee: string;
  amount: number;
  date: string;
  city: string;
  stateCode: string;
  description: string;
}

export interface SubAwardSearchParams {
  cfdaNumber: string;
  keywords: string;
  startDate?: string;
  endDate?: string;
  state?: string;
  agencies?: Agency[];
  page?: number;
  limit?: number;
}

export interface SubAwardSearchResponse {
  results: SubAwardResult[];
  page: number;
  hasNext: boolean;
  total: number;
}

export function useSubAwardSearch() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SubAwardResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [lastParams, setLastParams] = useState<SubAwardSearchParams | null>(null);
  const { toast } = useToast();

  const searchSubAwards = async (params: SubAwardSearchParams) => {
    setLoading(true);
    setLastParams(params);

    try {
      // Get consistent base filters (Rule 1: arrays, Rule 2: grant codes only)
      const agencies = params.agencies || [];
      const allAgenciesSelected = agencies.length === AGENCIES.length;

      const filters = getBaseFilters({
        alnNumber: params.cfdaNumber,
        keywords: params.keywords,
        startDate: params.startDate,
        endDate: params.endDate,
        state: params.state,
        agencies: agencies.length > 0 && !allAgenciesSelected ? agencies : undefined,
        useRecipientLocation: false, // Sub-awards use place_of_performance
      });

      const payload = {
        filters,
        fields: SUB_AWARD_FIELDS, // Rule 3: Sub-award specific field names
        subawards: true, // Toggle to sub-awards mode
        limit: params.limit || 50,
        page: params.page || 1,
      };

      console.log("SubAward search payload:", JSON.stringify(payload, null, 2));

      const response = await fetch(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const apiMsg = data?.detail || data?.message || data?.error || `API error: ${response.status}`;
        throw new Error(apiMsg);
      }

      // Map API response to our interface (Rule 3: handle sub-award field names)
      const mappedResults: SubAwardResult[] = (data.results || []).map(
        (item: any) => {
          // Parse location from "Sub-Award Primary Place of Performance"
          const pop = item["Sub-Award Primary Place of Performance"];
          let city = "";
          let stateCode = "";
          if (pop && typeof pop === "object") {
            city = pop.city || "";
            stateCode = pop.state_code || pop.state || "";
          } else if (typeof pop === "string") {
            const parts = pop.split(",").map((s: string) => s.trim());
            city = parts[0] || "";
            stateCode = parts[1] || "";
          }

          return {
            subAwardId: item["Sub-Award ID"] || "",
            subRecipient: item["Sub-Awardee Name"] || item["Recipient Name"] || "Unknown",
            primeAwardee: item["Prime Recipient Name"] || "Unknown",
            amount: parseFloat(item["Sub-Award Amount"] || item["Award Amount"]) || 0,
            date: item["Sub-Award Date"] || "",
            city,
            stateCode,
            description: item["Sub-Award Description"] || item["Description"] || "",
          };
        }
      );

      setResults(mappedResults);
      setPage(data.page_metadata?.page || 1);
      setHasNext(data.page_metadata?.hasNext || false);
      setTotal(data.page_metadata?.total || mappedResults.length);

      return {
        results: mappedResults,
        page: data.page_metadata?.page || 1,
        hasNext: data.page_metadata?.hasNext || false,
        total: data.page_metadata?.total || mappedResults.length,
      };
    } catch (error: any) {
      console.error("SubAward search error:", error);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: error.message || "Failed to search sub-awards",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setPage(1);
    setHasNext(false);
    setTotal(0);
    setLastParams(null);
  };

  const goToPage = async (newPage: number) => {
    if (!lastParams) return;
    await searchSubAwards({ ...lastParams, page: newPage });
  };

  return {
    loading,
    results,
    page,
    hasNext,
    total,
    searchSubAwards,
    clearResults,
    goToPage,
  };
}
