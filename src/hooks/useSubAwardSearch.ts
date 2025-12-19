import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const searchSubAwards = async (params: SubAwardSearchParams) => {
    setLoading(true);

    try {
      const payload: any = {
        subawards: true,
        filters: {
          time_period: [
            {
              start_date: params.startDate || "2024-01-01",
              end_date: params.endDate || "2024-12-31",
            },
          ],
        },
        fields: [
          "Sub-Award ID",
          "Sub-Awardee Name",
          "Prime Awardee Name",
          "Sub-Award Amount",
          "Sub-Award Date",
          "Description",
          "Sub-Award Place of Performance City",
          "Sub-Award Place of Performance State Code",
        ],
        limit: params.limit || 50,
        page: params.page || 1,
      };

      // Add CFDA number if provided
      if (params.cfdaNumber?.trim()) {
        payload.filters.program_numbers = [params.cfdaNumber.trim()];
      }

      // Add keywords if provided
      if (params.keywords?.trim()) {
        payload.filters.keywords = params.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }

      const response = await fetch(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Map API response to our interface
      const mappedResults: SubAwardResult[] = (data.results || []).map(
        (item: any) => ({
          subAwardId: item["Sub-Award ID"] || "",
          subRecipient: item["Sub-Awardee Name"] || "Unknown",
          primeAwardee: item["Prime Awardee Name"] || "Unknown",
          amount: parseFloat(item["Sub-Award Amount"]) || 0,
          date: item["Sub-Award Date"] || "",
          city: item["Sub-Award Place of Performance City"] || "",
          stateCode: item["Sub-Award Place of Performance State Code"] || "",
          description: item["Description"] || "",
        })
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
  };

  return {
    loading,
    results,
    page,
    hasNext,
    total,
    searchSubAwards,
    clearResults,
  };
}
