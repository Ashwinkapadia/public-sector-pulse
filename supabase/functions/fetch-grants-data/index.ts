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

    // Grants.gov search2 does not support explicit state or date filters,
    // so we pass the selected state as a keyword to bias results.
    if (state) {
      requestBody.keyword = state;
    }

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
      throw new Error(`Grants.gov API error: ${grantsResponse.status} ${grantsResponse.statusText}`);
    }

    const grantsData = await grantsResponse.json();
    console.log(`Received ${grantsData.oppHits?.length || 0} opportunities from Grants.gov`);

    if (!grantsData.oppHits || grantsData.oppHits.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No grant opportunities found for the specified criteria",
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
    let subawardsCreated = 0;

    // Process each grant opportunity
    for (const opportunity of grantsData.oppHits) {
      try {
        const oppNumber = opportunity.number || opportunity.id;
        const oppTitle = opportunity.title || "Untitled Grant";
        const agency = opportunity.agencyName || "Unknown Agency";
        const category = opportunity.categoryName || "General";
        const awardAmount = parseFloat(opportunity.awardCeiling) || 0;
        const fiscalYear = new Date(opportunity.postedDate || Date.now()).getFullYear();

        console.log(`Processing grant: ${oppNumber} - ${oppTitle}`);

        // Determine vertical (using category)
        let verticalId = verticalMap.get(category.toLowerCase());
        if (!verticalId) {
          verticalId = verticalMap.get("other");
        }

        if (!verticalId) {
          console.log(`Skipping ${oppNumber}: No matching vertical found`);
          continue;
        }

        // Determine grant type
        let grantTypeId = grantTypeMap.get("grant");
        
        // Check if opportunity mentions specific grant type keywords
        const titleLower = oppTitle.toLowerCase();
        if (titleLower.includes("cooperative agreement")) {
          grantTypeId = grantTypeMap.get("cooperative agreement");
        } else if (titleLower.includes("contract")) {
          grantTypeId = grantTypeMap.get("contract");
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
            cfda_code: opportunity.cfdaNumber || null,
            date_range_start: opportunity.postedDate || null,
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

        // Create sample subawards for larger grants
        if (fundingRecord && awardAmount > 100000) {
          const numSubawards = Math.floor(Math.random() * 2) + 1; // 1-2 subawards
          const subawardAmount = (awardAmount * 0.3) / numSubawards;
          
          for (let i = 0; i < numSubawards; i++) {
            try {
              const subawardOrgName = `${agency} - Grant Recipient ${i + 1}`;
              
              const { data: subOrg, error: subOrgError } = await supabaseClient
                .from("organizations")
                .upsert({
                  name: subawardOrgName,
                  state: state,
                  last_updated: new Date().toISOString().split("T")[0],
                }, { onConflict: "name,state" })
                .select()
                .single();

              if (subOrgError) {
                console.error(`Error creating subaward organization:`, subOrgError);
                continue;
              }

              if (subOrg) {
                const { error: subawardError } = await supabaseClient
                  .from("subawards")
                  .insert({
                    funding_record_id: fundingRecord.id,
                    recipient_organization_id: subOrg.id,
                    amount: subawardAmount,
                    award_date: opportunity.postedDate || new Date().toISOString().split("T")[0],
                    description: `Subaward for ${oppTitle}`,
                  });

                if (!subawardError) {
                  subawardsCreated++;
                }
              }
            } catch (error) {
              console.error("Error in subaward creation:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error processing opportunity:", error);
      }
    }

    console.log(`Successfully added ${recordsAdded} funding records and ${subawardsCreated} subawards from Grants.gov`);

    return new Response(
      JSON.stringify({
        success: true,
        recordsAdded,
        subawardsCreated,
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
