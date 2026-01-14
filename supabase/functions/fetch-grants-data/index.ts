import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  state?: string;
  startDate?: string;
  endDate?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with anon key to verify the user token
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Verify admin role
    const { data: roleData, error: roleError } = await authClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { state, startDate, endDate }: RequestBody = await req.json();

    if (!state) {
      return new Response(
        JSON.stringify({ error: "State is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching Grants.gov data for ${state}`, { startDate, endDate });

    // Initialize Supabase client - use service role only after confirming admin privileges
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch data from Grants.gov API using POST as documented for search2
    const requestBody: Record<string, unknown> = {
      rows: 50, // Fetch 50 opportunities
      oppStatuses: "forecasted|posted", // Get active opportunities
    };

    // Grants.gov search2 does not support explicit state filtering,
    // so we fetch all opportunities without state keyword filtering
    // Users can filter by state in the UI after fetching

    console.log("Fetching from Grants.gov with body:", JSON.stringify(requestBody));

    const grantsResponse = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!grantsResponse.ok) {
      const errorText = await grantsResponse.text();
      console.error(`Grants.gov API error: ${grantsResponse.status} - ${errorText}`);
      throw new Error(`Grants.gov API error: ${grantsResponse.status} ${grantsResponse.statusText}`);
    }

    const grantsData = await grantsResponse.json();
    console.log("Grants.gov API response:", JSON.stringify(grantsData).substring(0, 500));
    console.log(`Received ${grantsData.oppHits?.length || 0} opportunities from Grants.gov`);

    const oppHits = grantsData.data?.oppHits ?? [];
    console.log(`Grants.gov hitCount: ${grantsData.data?.hitCount}, oppHits length: ${oppHits.length}`);

    if (oppHits.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No grant opportunities returned from Grants.gov for the current query",
          recordsAdded: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing verticals and grant types
    const { data: verticals } = await supabaseClient
      .from("verticals")
      .select("*");

    const { data: grantTypes } = await supabaseClient
      .from("grant_types")
      .select("*");

    const verticalMap = new Map(verticals?.map((v) => [v.name.toLowerCase(), v.id]));
    const grantTypeMap = new Map(grantTypes?.map((gt) => [gt.name.toLowerCase(), gt.id]));
    
    let recordsAdded = 0;

    // Process each grant opportunity
    for (const opportunity of oppHits) {
      try {
        console.log(`Raw opportunity data:`, JSON.stringify(opportunity).substring(0, 300));
        
        const oppNumber = opportunity.number || opportunity.id;
        const oppTitle = opportunity.title || "Untitled Grant";
        const agency = opportunity.agency || "Unknown Agency";
        
        // Grants.gov doesn't provide funding category in basic search, use fundingInstruments or default
        const fundingInstrument = opportunity.fundingInstruments?.[0] || "Grant";
        
        // Grants.gov search2 doesn't include award amounts; fetch full details
        let awardAmount = 0;
        try {
          const detailResponse = await fetch("https://api.grants.gov/v1/api/fetchOpportunity", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ opportunityId: opportunity.id }),
          });

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const synopsis = detailData.data?.synopsis;
            const amountString =
              synopsis?.awardCeiling ??
              synopsis?.awardCeilingFormatted ??
              synopsis?.awardFloor ??
              synopsis?.awardFloorFormatted ??
              "0";

            const parsedAmount = parseFloat(amountString);
            if (!Number.isNaN(parsedAmount)) {
              awardAmount = parsedAmount;
            }
          } else {
            console.error(`fetchOpportunity failed for ${oppNumber}: ${detailResponse.status}`);
          }
        } catch (detailError) {
          console.error("Error fetching opportunity details:", detailError);
        }
        
        // Parse date
        const postedDate = opportunity.openDate || opportunity.postDate;
        const fiscalYear = postedDate ? new Date(postedDate).getFullYear() : new Date().getFullYear();
        
        // Get CFDA/ALN number
        const cfdaNumber = opportunity.cfdaList?.[0] || opportunity.cfda || null;

        console.log(`Processing grant: ${oppNumber} - ${oppTitle} (Agency: ${agency}, CFDA: ${cfdaNumber})`);

        // Intelligent vertical mapping based on keywords and CFDA codes
        const titleAndDesc = `${oppTitle} ${opportunity.description || ""}`.toLowerCase();
        let verticalId: string | undefined;

        // Map based on keywords in title/description
        if (titleAndDesc.match(/education|school|student|teacher|learning|academic/)) {
          if (titleAndDesc.match(/higher|college|university|postsecondary/)) {
            verticalId = verticalMap.get("higher education");
          } else if (titleAndDesc.match(/k-?12|elementary|secondary|kindergarten/)) {
            verticalId = verticalMap.get("k-12 education");
          }
        } else if (titleAndDesc.match(/workforce|employment|job training|career|apprentice/)) {
          verticalId = verticalMap.get("workforce development");
        } else if (titleAndDesc.match(/health|medical|mental health|substance|behavioral/)) {
          verticalId = verticalMap.get("public health");
        } else if (titleAndDesc.match(/transportation|transit|highway|infrastructure|road/)) {
          verticalId = verticalMap.get("transportation");
        } else if (titleAndDesc.match(/veteran|military|va |armed forces/)) {
          verticalId = verticalMap.get("veterans");
        } else if (titleAndDesc.match(/public safety|police|fire|emergency|justice|crime/)) {
          verticalId = verticalMap.get("public safety");
        } else if (titleAndDesc.match(/medicaid|medicare/)) {
          verticalId = verticalMap.get("medicaid");
        } else if (titleAndDesc.match(/aging|elder|senior|older adult/)) {
          verticalId = verticalMap.get("aging services");
        } else if (titleAndDesc.match(/home visit|maternal|infant|early childhood/)) {
          verticalId = verticalMap.get("home visiting");
        } else if (titleAndDesc.match(/re-?entry|reintegration|formerly incarcerated|prison release/)) {
          verticalId = verticalMap.get("re-entry");
        } else if (titleAndDesc.match(/violence|cvi|community violence/)) {
          verticalId = verticalMap.get("cvi prevention");
        }

        // CFDA code mapping (common federal program codes)
        if (!verticalId && cfdaNumber) {
          const cfdaPrefix = cfdaNumber.split('.')[0];
          if (cfdaPrefix === '84') { // Department of Education
            verticalId = verticalMap.get("k-12 education") || verticalMap.get("higher education");
          } else if (cfdaPrefix === '93') { // Department of Health and Human Services
            verticalId = verticalMap.get("public health");
          } else if (cfdaPrefix === '20') { // Department of Transportation
            verticalId = verticalMap.get("transportation");
          } else if (cfdaPrefix === '64') { // VA
            verticalId = verticalMap.get("veterans");
          } else if (cfdaPrefix === '17') { // Department of Labor
            verticalId = verticalMap.get("workforce development");
          } else if (cfdaPrefix === '16') { // Department of Justice
            verticalId = verticalMap.get("public safety");
          }
        }

        // Default to "Other" if no match
        if (!verticalId) {
          verticalId = verticalMap.get("other");
        }

        if (!verticalId) {
          console.log(`Skipping ${oppNumber}: No suitable vertical found in database`);
          continue;
        }

        // Determine grant type based on funding instrument
        let grantTypeId = grantTypeMap.get(fundingInstrument.toLowerCase());
        if (!grantTypeId) {
          grantTypeId = grantTypeMap.get("grant");
        }

        // Create or get organization (using agency as organization)
        const { data: existingOrg } = await supabaseClient
          .from("organizations")
          .select("id")
          .eq("name", agency)
          .eq("state", state)
          .single();

        let organizationId = existingOrg?.id;

        if (!organizationId) {
          const { data: newOrg, error: orgError } = await supabaseClient
            .from("organizations")
            .upsert({
              name: agency,
              state: state,
              description: `Federal agency: ${agency}`,
              last_updated: new Date().toISOString().split("T")[0],
            }, { onConflict: "name,state" })
            .select()
            .single();

          if (orgError) {
            console.error(`Error creating organization ${agency}:`, orgError);
            continue;
          }

          organizationId = newOrg.id;
        }

        // Check for existing funding record to prevent duplicates
        const { data: existingRecord } = await supabaseClient
          .from("funding_records")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("source", "Grants.gov")
          .eq("notes", `${oppTitle} (${oppNumber})`)
          .maybeSingle();

        if (existingRecord) {
          console.log(`Skipping duplicate grant: ${oppNumber}`);
          continue;
        }

        // Create funding record
        const { data: fundingRecord, error: fundingError } = await supabaseClient
          .from("funding_records")
          .insert({
            organization_id: organizationId,
            vertical_id: verticalId,
            grant_type_id: grantTypeId || null,
            amount: awardAmount,
            fiscal_year: fiscalYear,
            source: "Grants.gov",
            cfda_code: cfdaNumber,
            date_range_start: postedDate || null,
            date_range_end: opportunity.closeDate || null,
            notes: `${oppTitle} (${oppNumber})`,
          })
          .select()
          .single();

        if (fundingError) {
          console.error(`Error creating funding record for ${oppNumber}:`, fundingError);
          continue;
        }

        recordsAdded++;

        // Note: Award amounts not available in basic search results
        // Would need to call fetchOpportunity endpoint for each grant to get full details
      } catch (error) {
        console.error("Error processing opportunity:", error);
      }
    }

    console.log(`Successfully added ${recordsAdded} funding records from Grants.gov`);

    return new Response(
      JSON.stringify({
        success: true,
        recordsAdded,
        message: `Successfully fetched ${recordsAdded} grant opportunities from Grants.gov`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in fetch-grants-data function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
