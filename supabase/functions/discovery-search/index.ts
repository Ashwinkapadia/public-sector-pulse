import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, startDate, endDate, aln, alnPrefixes } = await req.json();

    // ─── Step 1: SAM.gov Assistance Listings ───
    if (action === "discover") {
      const samApiKey = Deno.env.get("SAM_API_KEY");
      if (!samApiKey) {
        return new Response(JSON.stringify({ error: "SAM_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch multiple pages to get comprehensive results
      const allListings: any[] = [];
      const pageSize = 100;
      const maxPages = 5; // Up to 500 results
      
      for (let page = 0; page < maxPages; page++) {
        const offset = page * pageSize;
        const url = `https://api.sam.gov/assistance-listings/v1/search?api_key=${samApiKey}&publishedDateFrom=${startDate}&publishedDateTo=${endDate}&limit=${pageSize}&offset=${offset}`;
        if (page === 0) console.log("SAM.gov Assistance Listings request:", url.replace(samApiKey, "***"));

        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("SAM.gov error:", errorText);
          if (page === 0) {
            return new Response(JSON.stringify({ error: `SAM.gov API error: ${response.status}`, details: errorText }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          break; // Use what we have from previous pages
        }

        const data = await response.json();
        const listings = data.assistanceListingsData || data.results || [];
        const pageItems = Array.isArray(listings) ? listings : [];
        allListings.push(...pageItems);
        
        // Stop if we got fewer than requested (no more pages)
        if (pageItems.length < pageSize) break;
      }
      
      console.log(`SAM.gov total fetched: ${allListings.length} listings`);

      let results = allListings.map((item: any) => ({
        aln: item.assistanceListingId || item.programNumber || "N/A",
        title: item.title || item.programTitle || "Untitled",
        agency: item.organizationName || item.department || "Unknown",
        link: item.assistanceListingId ? `https://sam.gov/fal/${item.assistanceListingId}/view` : "",
        postedDate: item.publishedDate || "",
        closeDate: item.archiveDate || "",
        type: "Federal Assistance Listing",
      }));

      const totalBeforeFilter = results.length;

      if (alnPrefixes && Array.isArray(alnPrefixes) && alnPrefixes.length > 0) {
        results = results.filter((r: any) => {
          if (r.aln === "N/A") return false;
          const prefix = r.aln.split(".")[0];
          return alnPrefixes.includes(prefix);
        });
        console.log(`Filtered by ALN prefixes [${alnPrefixes.join(",")}]: ${results.length} of ${totalBeforeFilter} results`);
      }

      return new Response(JSON.stringify({ results, totalBeforeFilter }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 2: Grants.gov FOA Search ───
    if (action === "track_grants_gov") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Grants.gov search2 API - no auth required
      const response = await fetch("https://api.grants.gov/v1/api/search2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: 25,
          aln: aln,
          oppStatuses: "forecasted|posted",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Grants.gov error:", errText);
        return new Response(JSON.stringify({ error: `Grants.gov API error: ${response.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const opportunities = data.data?.oppHits || [];
      const results = opportunities.map((opp: any) => ({
        id: opp.id,
        number: opp.number,
        title: opp.title,
        agency: opp.agencyCode || opp.agency || "",
        openDate: opp.openDate || "",
        closeDate: opp.closeDate || "",
        status: opp.oppStatus || "",
        alnList: opp.alnList || opp.cfdaList || "",
        link: opp.id ? `https://www.grants.gov/search-results-detail/${opp.id}` : "",
      }));

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 3: USAspending Prime Awards ───
    if (action === "track_prime") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload: any = {
        filters: {
          award_type_codes: ["02", "03", "04", "05"],
          program_numbers: [aln],
        },
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Awarding Agency",
          "Awarding Sub Agency",
          "Start Date",
          "End Date",
          "recipient_id",
          "Description",
        ],
        page: 1,
        limit: 10,
        subawards: false,
        order: "desc",
        sort: "Award Amount",
      };

      if (startDate && endDate) {
        payload.filters.time_period = [{ start_date: startDate, end_date: endDate }];
      }

      const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("USAspending prime error:", errText);
        return new Response(JSON.stringify({ error: `USAspending API error: ${response.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const results = (data.results || []).map((r: any) => ({
        awardId: r["Award ID"],
        recipientName: r["Recipient Name"],
        amount: r["Award Amount"],
        agency: r["Awarding Agency"],
        subAgency: r["Awarding Sub Agency"],
        startDate: r["Start Date"],
        endDate: r["End Date"],
        description: r["Description"],
      }));

      return new Response(JSON.stringify({ results, totalCount: data.page_metadata?.total || results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 4: USAspending Sub-Awards ───
    if (action === "track_sub") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload: any = {
        filters: {
          award_type_codes: ["02", "03", "04", "05"],
          program_numbers: [aln],
        },
        fields: [
          "Sub-Award ID",
          "Sub-Awardee Name",
          "Sub-Award Amount",
          "Prime Award ID",
          "Prime Recipient Name",
          "Sub-Award Date",
          "Sub-Award Description",
        ],
        page: 1,
        limit: 10,
        subawards: true,
        order: "desc",
        sort: "Sub-Award Amount",
      };

      if (startDate && endDate) {
        payload.filters.time_period = [{ start_date: startDate, end_date: endDate }];
      }

      const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("USAspending sub error:", errText);
        return new Response(JSON.stringify({ error: `USAspending API error: ${response.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const results = (data.results || []).map((r: any) => ({
        subAwardId: r["Sub-Award ID"],
        subAwardeeName: r["Sub-Awardee Name"],
        amount: r["Sub-Award Amount"],
        primeAwardId: r["Prime Award ID"],
        primeRecipientName: r["Prime Recipient Name"],
        date: r["Sub-Award Date"],
        description: r["Sub-Award Description"],
      }));

      return new Response(JSON.stringify({ results, totalCount: data.page_metadata?.total || results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Discovery search error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
