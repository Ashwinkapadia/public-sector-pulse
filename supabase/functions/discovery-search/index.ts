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

    // ─── Step 1: Grants.gov Discovery ───
    if (action === "discover") {
      // Search Grants.gov directly — no API key needed
      const grantsPayload: any = {
        rows: 100,
        oppStatuses: "forecasted|posted",
        sortBy: "openDate|desc",
      };

      // Apply ALN prefix filter if vertical selected
      if (alnPrefixes && Array.isArray(alnPrefixes) && alnPrefixes.length > 0) {
        // Grants.gov supports ALN search — use first prefix as primary filter
        grantsPayload.aln = alnPrefixes[0];
      }

      if (startDate) {
        const sd = new Date(startDate);
        grantsPayload.postedFrom = `${String(sd.getMonth() + 1).padStart(2, "0")}/${String(sd.getDate()).padStart(2, "0")}/${sd.getFullYear()}`;
      }
      if (endDate) {
        const ed = new Date(endDate);
        grantsPayload.postedTo = `${String(ed.getMonth() + 1).padStart(2, "0")}/${String(ed.getDate()).padStart(2, "0")}/${ed.getFullYear()}`;
      }

      console.log("Grants.gov discover payload:", JSON.stringify(grantsPayload));

      const response = await fetch("https://api.grants.gov/v1/api/search2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(grantsPayload),
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

      let results = opportunities.map((opp: any) => {
        const alnRaw = opp.alnList || opp.cfdaList || "";
        // Extract first ALN — handle both string and array formats
        let firstAln = "N/A";
        if (Array.isArray(alnRaw)) {
          firstAln = String(alnRaw[0] || "N/A").trim();
        } else if (typeof alnRaw === "string" && alnRaw.length > 0) {
          firstAln = alnRaw.split(",")[0]?.trim() || "N/A";
        }
        return {
          id: opp.id,
          number: opp.number,
          aln: firstAln,
          title: opp.title || "Untitled",
          agency: opp.agencyCode || opp.agency || "Unknown",
          openDate: opp.openDate || "",
          closeDate: opp.closeDate || "",
          status: opp.oppStatus || "",
          link: opp.id ? `https://www.grants.gov/search-results-detail/${opp.id}` : "",
        };
      });

      // Tag vertical matches
      if (alnPrefixes && Array.isArray(alnPrefixes) && alnPrefixes.length > 0) {
        results = results.map((r: any) => {
          let prefix = "";
          if (r.aln && r.aln !== "N/A") {
            if (r.aln.includes(".")) {
              prefix = r.aln.split(".")[0];
            } else if (r.aln.length >= 2) {
              prefix = r.aln.substring(0, 2);
            }
          }
          const isMatch = alnPrefixes.includes(prefix);
          return { ...r, verticalMatch: isMatch };
        });
        results.sort((a: any, b: any) => (b.verticalMatch ? 1 : 0) - (a.verticalMatch ? 1 : 0));
      }

      const totalCount = data.data?.totalCount || results.length;
      return new Response(JSON.stringify({ results, totalCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 2: USAspending Prime Awards ───
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
