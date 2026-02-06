import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Agency, AGENCIES } from "@/components/AgencyMultiSelect";

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
      // Build filters object
      const filters: any = {
        time_period: [{ 
          start_date: params.startDate || "2024-10-01", 
          end_date: params.endDate || "2025-09-30" 
        }],
        award_type_codes: ["02", "03", "04", "05"] // Typical Grant codes
      };

      // Add ALN/CFDA filter if provided
      const cfda = params.cfdaNumber?.trim();
      if (cfda) {
        const cfdaList = cfda.split(",").map(c => c.trim()).filter(c => c.length > 0);
        filters.program_numbers = cfdaList;
      }

      // Add keywords if provided
      const keywords = params.keywords?.trim();
      if (keywords) {
        filters.keywords = [keywords];
      }

      // Add state filter if provided
      const state = params.state?.trim();
      if (state && state !== "ALL") {
        filters.place_of_performance_locations = [{ country: "USA", state: state }];
      }

      // Add agencies filter if selected
      const agencies = params.agencies || [];
      if (agencies.length > 0 && agencies.length !== AGENCIES.length) {
        filters.agencies = agencies.map((agencyName) => ({
          type: "awarding",
          tier: "toptier",
          name: agencyName,
        }));
      }

      const payload = {
        filters,
        fields: [
          "Award ID", 
          "Recipient Name", 
          "Award Amount", 
          "Assistance Listing Number",
          "Sub-Award ID",
          "Sub-Awardee Name",
          "Prime Recipient Name",
          "Sub-Award Amount",
          "Sub-Award Date",
          "Sub-Award Description",
          "Sub-Award Primary Place of Performance",
        ],
        limit: params.limit || 50,
        page: params.page || 1,
        subawards: true
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

      // Map API response to our interface
      const mappedResults: SubAwardResult[] = (data.results || []).map(
        (item: any) => {
          // Parse location from "Sub-Award Primary Place of Performance" object or string
          const pop = item["Sub-Award Primary Place of Performance"];
          let city = "";
          let stateCode = "";
          if (pop && typeof pop === "object") {
            city = pop.city || "";
            stateCode = pop.state_code || pop.state || "";
          } else if (typeof pop === "string") {
            // Sometimes returned as "City, ST"
            const parts = pop.split(",").map((s: string) => s.trim());
            city = parts[0] || "";
            stateCode = parts[1] || "";
          }

          return {
            subAwardId: item["Sub-Award ID"] || "",
            subRecipient: item["Sub-Awardee Name"] || "Unknown",
            primeAwardee: item["Prime Recipient Name"] || "Unknown",
            amount: parseFloat(item["Sub-Award Amount"]) || 0,
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
