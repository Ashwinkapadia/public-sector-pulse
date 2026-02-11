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

      // Use the Assistance Listings API for grants with ALN/CFDA numbers
      const url = `https://api.sam.gov/assistance-listings/v1/search?api_key=${samApiKey}&publishedDateFrom=${startDate}&publishedDateTo=${endDate}&limit=50`;

      console.log("SAM.gov Assistance Listings request:", url.replace(samApiKey, "***"));

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("SAM.gov error:", errorText);
        return new Response(JSON.stringify({ error: `SAM.gov API error: ${response.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      console.log("SAM.gov response keys:", JSON.stringify(Object.keys(data)));

      // The API returns assistanceListingsData array
      const listings = data.assistanceListingsData || data.results || [];
      const results = (Array.isArray(listings) ? listings : []).map((item: any) => ({
        aln: item.assistanceListingId || item.programNumber || "N/A",
        title: item.title || item.programTitle || "Untitled",
        agency: item.organizationName || item.department || "Unknown",
        link: item.assistanceListingId ? `https://sam.gov/fal/${item.assistanceListingId}/view` : "",
        postedDate: item.publishedDate || "",
        closeDate: item.archiveDate || "",
        type: "Federal Assistance Listing",
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
