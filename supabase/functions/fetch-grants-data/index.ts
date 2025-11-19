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
    const { state, startDate, endDate }: RequestBody = await req.json();

    if (!state) {
      return new Response(
        JSON.stringify({ error: "State is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching Grants.gov data for ${state}`, { startDate, endDate });

    // Initialize Supabase client
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
        const agency = opportunity.agencyName || "Unknown Agency";
        
        // Grants.gov doesn't provide funding category in basic search, use fundingInstruments or default
        const fundingInstrument = opportunity.fundingInstruments?.[0] || "Grant";
        
        // No award ceiling in basic search results - would need fetchOpportunity for details
        const awardAmount = 0; // Not available in search results
        
        // Parse date
        const postedDate = opportunity.openDate || opportunity.postDate;
        const fiscalYear = postedDate ? new Date(postedDate).getFullYear() : new Date().getFullYear();
        
        // Get CFDA/ALN number
        const cfdaNumber = opportunity.alnist?.[0] || opportunity.aln || null;

        console.log(`Processing grant: ${oppNumber} - ${oppTitle} (Agency: ${agency}, CFDA: ${cfdaNumber})`);

        // Determine vertical - default to "Other" since basic search doesn't have category
        let verticalId = verticalMap.get("other");

        if (!verticalId) {
          console.log(`Skipping ${oppNumber}: No 'Other' vertical found in database`);
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
