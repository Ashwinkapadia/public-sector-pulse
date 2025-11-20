import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
            "Action Date",
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
    const totalResults = searchData.page_metadata?.total || 0;
    const totalPages = Math.min(
      Math.ceil(totalResults / 100),
      10
    ); // Increased to 10 pages (max 1000 records) for better coverage
    
    console.log(`Total results available: ${totalResults}, fetching up to ${totalPages} pages`);

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
              "Action Date",
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
    const existingRecords = new Set<string>();

    // Get existing funding records to prevent duplicates
    const { data: existingFundingRecords } = await supabaseClient
      .from("funding_records")
      .select("organization_id, amount, fiscal_year, source")
      .eq("source", "USAspending.gov");
    
    existingFundingRecords?.forEach(record => {
      existingRecords.add(`${record.organization_id}-${record.amount}-${record.fiscal_year}`);
    });

    // Process each result
    for (const result of allResults) {
      try {
        const recipientName = result["Recipient Name"];
        const awardAmount = parseFloat(result["Award Amount"]) || 0;
        const awardingAgency = result["Awarding Agency"] || "Unknown";
        const startDateStr = result["Start Date"];
        const endDateStr = result["End Date"];
        const actionDateStr = result["Action Date"] || startDateStr; // Use Action Date for when grant was awarded
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

        // Determine vertical using intelligent mapping
        const description = result["Description"] || "";
        const subAgency = result["Awarding Sub Agency"] || "";
        const combinedText = `${cfdaTitle} ${description} ${awardingAgency} ${subAgency} ${recipientName}`.toLowerCase();
        
        let verticalName = "Other";
        
        // Workforce Development
        if (
          combinedText.match(/\b(workforce|employment|job training|career|apprentice|labor|occupational|vocational training|wioa)\b/)
        ) {
          verticalName = "Workforce Development";
        }
        // Aging Services
        else if (
          combinedText.match(/\b(aging|elderly|senior|older adult|elder care|geriatric|nutrition for the elderly|meals on wheels)\b/)
        ) {
          verticalName = "Aging Services";
        }
        // Veterans
        else if (
          combinedText.match(/\b(veteran|veterans|va medical|military service|veteran affairs)\b/)
        ) {
          verticalName = "Veterans";
        }
        // CVI Prevention (Community Violence Intervention)
        else if (
          combinedText.match(/\b(violence intervention|violence prevention|community violence|crime prevention|juvenile justice|gang|victim)\b/)
        ) {
          verticalName = "CVI Prevention";
        }
        // Home Visiting
        else if (
          combinedText.match(/\b(home visiting|maternal health|child health|early childhood|home visitation|maternal infant|prenatal|postpartum|family support|healthy start)\b/)
        ) {
          verticalName = "Home Visiting";
        }
        // Re-entry
        else if (
          combinedText.match(/\b(reentry|re-entry|prisoner reintegration|correctional|prison|incarceration|offender|recidivism|post-release|second chance)\b/)
        ) {
          verticalName = "Re-entry";
        }
        // Energy & Environment (catch more grants)
        else if (
          combinedText.match(/\b(energy|renewable|solar|wind|climate|environment|conservation|emission|carbon|battery|electric|hydrogen|green|sustainable|recycl)\b/)
        ) {
          verticalName = "Energy & Environment";
        }
        // Transportation & Infrastructure
        else if (
          combinedText.match(/\b(transportation|transit|highway|airport|port|infrastructure|rail|bridge|road|traffic)\b/)
        ) {
          verticalName = "Transportation & Infrastructure";
        }
        // Education
        else if (
          combinedText.match(/\b(education|school|student|academic|university|college|learning|literacy|teach)\b/)
        ) {
          verticalName = "Education";
        }
        // Healthcare
        else if (
          combinedText.match(/\b(health|medical|hospital|clinic|disease|mental health|substance abuse|treatment|patient|care)\b/)
        ) {
          verticalName = "Healthcare";
        }
        
        console.log(`Mapping "${recipientName}" to vertical: ${verticalName}`);

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

        // Check for duplicate funding record
        const recordKey = `${organizationId}-${awardAmount}-${fiscalYear}`;
        if (existingRecords.has(recordKey)) {
          console.log(`Skipping duplicate record for ${recipientName}`);
          continue;
        }

        // Insert funding record with last_updated timestamp and action_date
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
            action_date: actionDateStr || null,
            cfda_code: cfdaNumber || null,
            grant_type_id: grantTypeId,
            notes: `From USAspending.gov - ${awardingAgency}`,
            source: "USAspending.gov",
            last_updated: new Date().toISOString(),
          })
          .select()
          .single();

        if (fundingError) {
          console.error("Error inserting funding record:", fundingError);
        } else {
          recordsAdded++;
          existingRecords.add(recordKey);

          // Fetch real subaward data from USASpending.gov
          if (fundingRecord && result.internal_id) {
            try {
              console.log(`Fetching subawards for award ${result.internal_id}...`);
              
              const subawardsResponse = await fetch("https://api.usaspending.gov/api/v2/subawards/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  award_id: result.internal_id,
                  limit: 10, // Limit to top 10 subawards per award
                  page: 1,
                }),
              });

              if (subawardsResponse.ok) {
                const subawardsData = await subawardsResponse.json();
                const subawards = subawardsData.results || [];
                
                console.log(`Found ${subawards.length} real subawards for ${recipientName}`);
                let subawardsAdded = 0;

                for (const subaward of subawards) {
                  try {
                    const subRecipientName = subaward.recipient_name || subaward.sub_awardee_or_recipient_legal || "Unknown Recipient";
                    const subAmount = parseFloat(subaward.amount) || 0;
                    const subAwardDate = subaward.action_date || subaward.sub_action_date || startDateStr;
                    const subState = subaward.recipient_location_state_code || state;

                    if (subAmount > 0 && subRecipientName && subRecipientName !== "Unknown Recipient") {
                      // Create or get subaward recipient organization
                      const { data: subOrg, error: subOrgError } = await supabaseClient
                        .from("organizations")
                        .upsert({
                          name: subRecipientName,
                          state: subState,
                          city: subaward.recipient_location_city_name || null,
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
                            amount: subAmount,
                            award_date: subAwardDate,
                            description: subaward.description || `${cfdaTitle || verticalName} program subaward`,
                          });

                        if (subawardError) {
                          console.error(`Error creating subaward: ${subawardError.message}`);
                        } else {
                          subawardsAdded++;
                        }
                      }
                    }
                  } catch (subError) {
                    console.error("Error processing subaward:", subError);
                  }
                }

                if (subawardsAdded > 0) {
                  console.log(`Successfully added ${subawardsAdded} real subawards for ${recipientName}`);
                }
              } else {
                console.log(`No subaward data available for award ${result.internal_id}`);
              }
            } catch (error) {
              console.error("Error fetching subawards:", error);
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
