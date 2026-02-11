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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, startDate, endDate, aln } = await req.json();

    if (action === "discover") {
      // SAM.gov opportunity search
      const samApiKey = Deno.env.get("SAM_API_KEY");
      if (!samApiKey) {
        return new Response(JSON.stringify({ error: "SAM_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fmtStart = new Date(startDate).toLocaleDateString("en-US", { timeZone: "UTC" });
      const fmtEnd = new Date(endDate).toLocaleDateString("en-US", { timeZone: "UTC" });

      const url = `https://api.sam.gov/opportunities/v2/search?api_key=${samApiKey}&postedFrom=${fmtStart}&postedTo=${fmtEnd}&limit=50&ptype=g`;

      console.log("SAM.gov request:", url.replace(samApiKey, "***"));

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error("SAM.gov error:", JSON.stringify(data));
        return new Response(JSON.stringify({ error: data.error?.message || `SAM.gov API error: ${response.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = (data.opportunitiesData || []).map((item: any) => ({
        aln: item.cfdaNumber || item.alternativeReferenceCode || "N/A",
        title: item.title || "Untitled",
        agency: item.fullParentPathName || item.departmentName || "Unknown",
        link: item.uiLink || "",
        postedDate: item.postedDate || "",
        closeDate: item.archiveDate || item.responseDeadLine || "",
        type: item.type || "",
      }));

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "track_nih") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanAln = aln.replace(".", "");
      const response = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: { cfda_codes: [cleanAln] },
          limit: 10,
        }),
      });
      const data = await response.json();

      return new Response(JSON.stringify({ results: data.results || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "track_nsf") {
      if (!aln) {
        return new Response(JSON.stringify({ error: "ALN required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://api.nsf.gov/services/v1/awards.json?cfdaNumber=${aln}&printFields=id,awardeeName,fundsObligatedAmt,title,startDate,expDate`;
      const response = await fetch(url);
      const data = await response.json();

      return new Response(JSON.stringify({ results: data.response?.award || [] }), {
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
