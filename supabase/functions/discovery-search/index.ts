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
      const PAGE_SIZE = 100;
      const MAX_PAGES = 50; // safety cap: 5000 results max

      const basePayload: any = {
        rows: PAGE_SIZE,
        oppStatuses: "forecasted|posted",
        sortBy: "openDate|desc",
      };

      if (alnPrefixes && Array.isArray(alnPrefixes) && alnPrefixes.length > 0) {
        basePayload.aln = alnPrefixes[0];
      }

      if (startDate) {
        const sd = new Date(startDate);
        basePayload.postedFrom = `${String(sd.getMonth() + 1).padStart(2, "0")}/${String(sd.getDate()).padStart(2, "0")}/${sd.getFullYear()}`;
      }
      if (endDate) {
        const ed = new Date(endDate);
        basePayload.postedTo = `${String(ed.getMonth() + 1).padStart(2, "0")}/${String(ed.getDate()).padStart(2, "0")}/${ed.getFullYear()}`;
      }

      // Paginate through all results
      let allOpportunities: any[] = [];
      let totalCount = 0;
      let page = 0;

      while (page < MAX_PAGES) {
        const payload = { ...basePayload, startRecordNum: page * PAGE_SIZE };
        console.log(`Grants.gov page ${page + 1}:`, JSON.stringify(payload));

        const response = await fetch("https://api.grants.gov/v1/api/search2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Grants.gov error:", errText);
          if (allOpportunities.length === 0) {
            return new Response(JSON.stringify({ error: `Grants.gov API error: ${response.status}` }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          break; // return what we have so far
        }

        const data = await response.json();
        const hits = data.data?.oppHits || [];
        totalCount = data.data?.totalCount || 0;
        allOpportunities = allOpportunities.concat(hits);

        console.log(`Fetched ${allOpportunities.length} / ${totalCount}`);

        if (allOpportunities.length >= totalCount || hits.length < PAGE_SIZE) {
          break;
        }
        page++;
      }

      let results = allOpportunities.map((opp: any) => {
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

      return new Response(JSON.stringify({ results, totalCount: totalCount || results.length }), {
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

      const PAGE_SIZE = 100;
      const MAX_PAGES = 10;
      let allResults: any[] = [];
      let totalCount = 0;
      let page = 1;

      while (page <= MAX_PAGES) {
        const payload: any = {
          filters: {
            award_type_codes: ["02", "03", "04", "05"],
            program_numbers: [aln],
          },
          fields: [
            "Award ID", "Recipient Name", "Award Amount",
            "Awarding Agency", "Awarding Sub Agency",
            "Start Date", "End Date", "Description",
          ],
          page,
          limit: PAGE_SIZE,
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
          if (allResults.length === 0) {
            return new Response(JSON.stringify({ error: `USAspending API error: ${response.status}` }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          break;
        }

        const data = await response.json();
        totalCount = data.page_metadata?.total || 0;
        const hits = data.results || [];
        allResults = allResults.concat(hits);
        console.log(`Prime awards page ${page}: fetched ${allResults.length}/${totalCount}`);

        if (!data.page_metadata?.hasNext || hits.length < PAGE_SIZE) break;
        page++;
      }

      const results = allResults.map((r: any) => ({
        awardId: r["Award ID"],
        recipientName: r["Recipient Name"],
        amount: r["Award Amount"],
        agency: r["Awarding Agency"],
        subAgency: r["Awarding Sub Agency"],
        startDate: r["Start Date"],
        endDate: r["End Date"],
        description: r["Description"],
      }));

      return new Response(JSON.stringify({ results, totalCount: totalCount || results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 3: USAspending Sub-Awards ───
    if (action === "track_sub") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const PAGE_SIZE = 100;
      const MAX_PAGES = 10;
      let allResults: any[] = [];
      let totalCount = 0;
      let page = 1;

      while (page <= MAX_PAGES) {
        const payload: any = {
          filters: {
            award_type_codes: ["02", "03", "04", "05"],
            program_numbers: [aln],
          },
          fields: [
            "Sub-Award ID", "Sub-Awardee Name", "Sub-Award Amount",
            "Prime Award ID", "Prime Recipient Name",
            "Sub-Award Date", "Sub-Award Description",
          ],
          page,
          limit: PAGE_SIZE,
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
          if (allResults.length === 0) {
            return new Response(JSON.stringify({ error: `USAspending API error: ${response.status}` }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          break;
        }

        const data = await response.json();
        totalCount = data.page_metadata?.total || 0;
        const hits = data.results || [];
        allResults = allResults.concat(hits);
        console.log(`Sub-awards page ${page}: fetched ${allResults.length}/${totalCount}`);

        if (!data.page_metadata?.hasNext || hits.length < PAGE_SIZE) break;
        page++;
      }

      const results = allResults.map((r: any) => ({
        subAwardId: r["Sub-Award ID"],
        subAwardeeName: r["Sub-Awardee Name"],
        amount: r["Sub-Award Amount"],
        primeAwardId: r["Prime Award ID"],
        primeRecipientName: r["Prime Recipient Name"],
        date: r["Sub-Award Date"],
        description: r["Sub-Award Description"],
      }));

      return new Response(JSON.stringify({ results, totalCount: totalCount || results.length }), {
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
