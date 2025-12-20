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
      // Award type codes for assistance (grants) sub-awards
      // 02=Block Grant, 03=Formula Grant, 04=Project Grant, 05=Cooperative Agreement
      // 06=Direct Payment, 07=Direct Loan, 08=Guaranteed Loan, 09=Insurance, 10=Direct Payment (unrestricted), 11=Other
      const assistanceAwardTypes = ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];

      const payload: any = {
        subawards: true,
        filters: {
          award_type_codes: assistanceAwardTypes,
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
          "Prime Recipient Name",
          "Sub-Award Amount",
          "Sub-Award Date",
          "Sub-Award Description",
          "Sub-Award Primary Place of Performance",
        ],
        limit: params.limit || 100,
        page: params.page || 1,
      };

      // Add CFDA number(s) if provided - supports comma-separated list
      const cfda = params.cfdaNumber?.trim();
      if (cfda) {
        // Split by comma to support multiple CFDA codes (e.g., "93.778,16.034")
        const cfdaList = cfda.split(",").map(c => c.trim()).filter(c => c.length > 0);
        // USAspending documentation/examples vary between `program_numbers` and `cfda_numbers`.
        // We start with `program_numbers` (per original spec) and fall back to `cfda_numbers`
        // if the API returns a 422.
        payload.filters.program_numbers = cfdaList;
      }

      // Add keywords if provided (keep as a single phrase)
      const keywords = params.keywords?.trim();
      if (keywords) {
        payload.filters.keywords = [keywords];
      }

      // Add state/location filter if provided (not "ALL")
      const state = params.state?.trim();
      if (state && state !== "ALL") {
        payload.filters.place_of_performance_locations = [
          { country: "USA", state: state }
        ];
      }

      // Add agencies filter if selected (and not all agencies)
      const agencies = params.agencies || [];
      const allAgenciesSelected = agencies.length === AGENCIES.length;
      if (agencies.length > 0 && !allAgenciesSelected) {
        payload.filters.agencies = agencies.map((agencyName) => ({
          type: "awarding",
          tier: "toptier",
          name: agencyName,
        }));
      }

      const doRequest = async (body: any) => {
        const res = await fetch(
          "https://api.usaspending.gov/api/v2/search/spending_by_award/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        return { res, json, text };
      };

      let { res: response, json: data, text } = await doRequest(payload);

      // Fallback: if CFDA-only (or CFDA+keywords) yields 422, retry with cfda_numbers.
      if (!response.ok && response.status === 422 && cfda) {
        const cfdaList = cfda.split(",").map(c => c.trim()).filter(c => c.length > 0);
        const retryPayload = {
          ...payload,
          filters: {
            ...payload.filters,
            cfda_numbers: cfdaList,
          },
        };
        delete (retryPayload.filters as any).program_numbers;

        ({ res: response, json: data, text } = await doRequest(retryPayload));
      }

      if (!response.ok) {
        const apiMsg =
          data?.detail ||
          data?.message ||
          data?.error ||
          (typeof data === "string" ? data : null) ||
          text?.slice(0, 300);
        throw new Error(apiMsg || `API error: ${response.status}`);
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
