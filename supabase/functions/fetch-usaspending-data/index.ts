import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to format currency
const formatAmount = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
};

interface RequestBody {
  state: string;
  startDate?: string;
  endDate?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { state, startDate, endDate } = await req.json() as RequestBody;

    if (!state) {
      return new Response(
        JSON.stringify({ error: "State is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Fetching data for state: ${state}`);

    // Get current fiscal year
    const currentYear = new Date().getFullYear();
    const fiscalYear = startDate
      ? new Date(startDate).getFullYear()
      : currentYear;

    // Search for spending data by state
    const searchResponse = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: {
            recipient_locations: [
              {
                country: "USA",
                state: state,
              },
            ],
            time_period: [
              {
                start_date: startDate || `${fiscalYear}-01-01`,
                end_date: endDate || `${fiscalYear}-12-31`,
              },
            ],
            award_type_codes: ["02", "03", "04", "05"],
          },
          fields: [
            "Award ID",
            "Recipient Name",
            "Award Amount",
            "Award Type",
            "Awarding Agency",
            "Awarding Sub Agency",
            "Start Date",
            "End Date",
            "Description",
            "CFDA Number",
            "CFDA Title",
          ],
          limit: 100,
          page: 1,
          order: "desc",
          sort: "Award Amount",
        }),
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("USAspending API error:", errorText);
      throw new Error(`USAspending API returned ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    console.log(`Found ${searchData.results?.length || 0} results from page 1`);

    // Fetch additional pages if available
    let allResults = searchData.results || [];
    const totalPages = Math.min(
      Math.ceil((searchData.page_metadata?.total || 0) / 100),
      5
    ); // Limit to 5 pages (max 500 records)

    for (let page = 2; page <= totalPages; page++) {
      const pageResponse = await fetch(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: {
              recipient_locations: [
                {
                  country: "USA",
                  state: state,
                },
              ],
              time_period: [
                {
                  start_date: startDate || `${fiscalYear}-01-01`,
                  end_date: endDate || `${fiscalYear}-12-31`,
                },
              ],
              award_type_codes: ["02", "03", "04", "05"],
            },
            fields: [
              "Award ID",
              "Recipient Name",
              "Award Amount",
              "Award Type",
              "Awarding Agency",
              "Awarding Sub Agency",
              "Start Date",
              "End Date",
              "Description",
              "CFDA Number",
              "CFDA Title",
            ],
            limit: 100,
            page: page,
            order: "desc",
            sort: "Award Amount",
          }),
        }
      );

      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        allResults = allResults.concat(pageData.results || []);
        console.log(
          `Found ${pageData.results?.length || 0} results from page ${page}`,
        );
      }
    }

    console.log(`Total results fetched: ${allResults.length}`);

    // Get existing verticals
    const { data: existingVerticals } = await supabaseClient
      .from("verticals")
      .select("id, name");

    const verticalMap = new Map(
      (existingVerticals || []).map((v) => [v.name.toLowerCase(), v.id])
    );

    // Get existing grant types for CFDA matching
    const { data: grantTypes } = await supabaseClient
      .from("grant_types")
      .select("id, cfda_code, name");

    const grantTypeMap = new Map(
      (grantTypes || []).map((gt) => [gt.cfda_code, gt.id])
    );
    const grantTypeNameMap = new Map(
      (grantTypes || []).map((gt) => [gt.name.toLowerCase(), gt.id])
    );

    let recordsAdded = 0;
    const processedOrgs = new Set<string>();

    // Process each result
    for (const result of allResults) {
      try {
        const recipientName = result["Recipient Name"];
        const awardAmount = parseFloat(result["Award Amount"]) || 0;
        const awardingAgency = result["Awarding Agency"] || "Unknown";
        const startDateStr = result["Start Date"];
        const endDateStr = result["End Date"];
        const cfdaNumber = result["CFDA Number"];
        const cfdaTitle = result["CFDA Title"];

        // Match grant type by CFDA code first, then by name
        let grantTypeId = null;
        if (cfdaNumber) {
          grantTypeId = grantTypeMap.get(cfdaNumber) || null;
        }
        if (!grantTypeId && cfdaTitle) {
          grantTypeId = grantTypeNameMap.get(cfdaTitle.toLowerCase()) || null;
        }

        // Determine vertical based on agency name
        let verticalName = "Other";
        const agencyLower = awardingAgency.toLowerCase();
        
        if (
          agencyLower.includes("labor") ||
          agencyLower.includes("employment") ||
          agencyLower.includes("workforce")
        ) {
          verticalName = "Workforce Development";
        } else if (agencyLower.includes("aging") || agencyLower.includes("elder")) {
          verticalName = "Aging Services";
        } else if (agencyLower.includes("veteran")) {
          verticalName = "Veterans";
        } else if (
          agencyLower.includes("violence") ||
          agencyLower.includes("justice") ||
          agencyLower.includes("crime")
        ) {
          verticalName = "CVI Prevention";
        } else if (agencyLower.includes("health") || agencyLower.includes("hhs")) {
          verticalName = "Home Visiting";
        } else if (
          agencyLower.includes("correction") ||
          agencyLower.includes("prison") ||
          agencyLower.includes("reentry")
        ) {
          verticalName = "Re-entry";
        }

        const verticalId = verticalMap.get(verticalName.toLowerCase());

        if (!verticalId) {
          console.log(`Skipping - vertical not found: ${verticalName}`);
          continue;
        }

        // Check if organization already exists
        let organizationId: string;

        if (processedOrgs.has(recipientName)) {
          const { data: existingOrg } = await supabaseClient
            .from("organizations")
            .select("id")
            .eq("name", recipientName)
            .eq("state", state)
            .single();

          organizationId = existingOrg?.id;
        } else {
          const { data: existingOrg } = await supabaseClient
            .from("organizations")
            .select("id")
            .eq("name", recipientName)
            .eq("state", state)
            .maybeSingle();

          if (existingOrg) {
            organizationId = existingOrg.id;
          } else {
            // Insert new organization
            const { data: newOrg, error: orgError } = await supabaseClient
              .from("organizations")
              .insert({
                name: recipientName,
                state: state,
                last_updated: new Date().toISOString().split("T")[0],
              })
              .select()
              .single();

            if (orgError) {
              console.error("Error inserting organization:", orgError);
              continue;
            }

            organizationId = newOrg.id;
          }

          processedOrgs.add(recipientName);
        }

        // Insert funding record
        const { data: fundingRecord, error: fundingError } = await supabaseClient
          .from("funding_records")
          .insert({
            organization_id: organizationId,
            vertical_id: verticalId,
            amount: awardAmount,
            status: "Active",
            fiscal_year: fiscalYear,
            date_range_start: startDateStr || null,
            date_range_end: endDateStr || null,
            cfda_code: cfdaNumber || null,
            grant_type_id: grantTypeId,
            notes: `From USAspending.gov - ${awardingAgency}`,
          })
          .select()
          .single();

        if (fundingError) {
          console.error("Error inserting funding record:", fundingError);
        } else {
          recordsAdded++;

          // Create sample subawards (20-30% of funding amount distributed)
          if (fundingRecord && awardAmount > 50000) {
            const numSubawards = Math.floor(Math.random() * 3) + 1; // 1-3 subawards
            const subawardAmount = (awardAmount * 0.25) / numSubawards;
            console.log(`Creating ${numSubawards} subawards for ${recipientName} (${formatAmount(awardAmount)})`);

            for (let i = 0; i < numSubawards; i++) {
              try {
                // Create or get subaward recipient organization
                const subawardOrgName = `${recipientName} - Subrecipient ${i + 1}`;
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
                  console.error(`Error creating subaward organization: ${subOrgError.message}`);
                  continue;
                }

                if (subOrg) {
                  const { error: subawardError } = await supabaseClient
                    .from("subawards")
                    .insert({
                      funding_record_id: fundingRecord.id,
                      recipient_organization_id: subOrg.id,
                      amount: subawardAmount,
                      award_date: startDateStr || new Date().toISOString().split("T")[0],
                      description: `Subaward for ${cfdaTitle || verticalName} program`,
                    });

                  if (subawardError) {
                    console.error(`Error creating subaward: ${subawardError.message}`);
                  }
                }
              } catch (error) {
                console.error("Error in subaward creation:", error);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error processing result:", error);
      }
    }

    // Count subawards created
    const { count: subawardCount } = await supabaseClient
      .from("subawards")
      .select("*", { count: "exact", head: true });

    console.log(`Successfully added ${recordsAdded} funding records and ${subawardCount || 0} subawards`);

    return new Response(
      JSON.stringify({
        success: true,
        recordsAdded,
        message: `Fetched and stored ${recordsAdded} funding records`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in fetch-usaspending-data function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
