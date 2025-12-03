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
  sessionId?: string;
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

    const { state, startDate, endDate, sessionId } = await req.json() as RequestBody & { sessionId?: string };
    
    // Create progress tracking session
    const progressSessionId = sessionId || crypto.randomUUID();
    
    const { error: progressError } = await supabaseClient
      .from("fetch_progress")
      .upsert({
        session_id: progressSessionId,
        state,
        source: "USAspending.gov",
        status: "running",
        message: "Starting fetch...",
        total_pages: 0,
        current_page: 0,
        records_inserted: 0,
        errors: [],
      });

    if (progressError) {
      console.error("Error creating progress:", progressError);
    }

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

    // Clear existing USAspending.gov data for this state before fetching new data
    // First, get all organizations for this state
    const { data: orgsForState, error: orgsError } = await supabaseClient
      .from("organizations")
      .select("id")
      .eq("state", state);

    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
    }

    const orgIdsForState = (orgsForState || []).map((org) => org.id);

    // Only delete funding records from USAspending.gov for this state
    if (orgIdsForState.length > 0) {
      const { data: fundingToClear, error: fundingSelectError } = await supabaseClient
        .from("funding_records")
        .select("id")
        .in("organization_id", orgIdsForState)
        .eq("source", "USAspending.gov");

      if (fundingSelectError) {
        console.error("Error fetching funding records to clear:", fundingSelectError);
      } else {
        const fundingIdsToClear = (fundingToClear || []).map((fr) => fr.id);

        if (fundingIdsToClear.length > 0) {
          // Delete subawards first
          const { error: subawardsDeleteError } = await supabaseClient
            .from("subawards")
            .delete()
            .in("funding_record_id", fundingIdsToClear);

          if (subawardsDeleteError) {
            console.error("Error deleting existing subawards:", subawardsDeleteError);
          }

          // Delete funding records
          const { error: fundingDeleteError } = await supabaseClient
            .from("funding_records")
            .delete()
            .in("id", fundingIdsToClear);

          if (fundingDeleteError) {
            console.error("Error deleting existing funding records:", fundingDeleteError);
          }

          console.log(`Cleared ${fundingIdsToClear.length} existing USAspending.gov records for ${state}`);
        }
      }
    }

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
    const hasNext = searchData.page_metadata?.hasNext ?? false;
    const maxPages = 5;
    const totalPages = hasNext ? maxPages : 1; // If more pages exist, fetch up to 5 pages (max 500 records)
    
    console.log(
      `Page 1 fetched. hasNext=${hasNext}. Will fetch up to ${totalPages} pages (max ${maxPages}).`,
    );
    
    // Update progress with total pages
    await supabaseClient
      .from("fetch_progress")
      .update({
        total_pages: totalPages,
        current_page: 1,
        message: `Processing page 1 of ${totalPages}`,
      })
      .eq("session_id", progressSessionId);

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
        
        // Update progress after each page
        await supabaseClient
          .from("fetch_progress")
          .update({
            current_page: page,
            message: `Processing page ${page} of ${totalPages}`,
          })
          .eq("session_id", progressSessionId);
      }
    }

    console.log(`Total results fetched: ${allResults.length}`);
    
    // Update progress: starting to process records
    await supabaseClient
      .from("fetch_progress")
      .update({
        message: `Fetched ${allResults.length} results, processing records...`,
      })
      .eq("session_id", progressSessionId);

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
    const errors: string[] = [];

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
          
          // Update progress every 10 records
          if (recordsAdded % 10 === 0) {
            await supabaseClient
              .from("fetch_progress")
              .update({
                records_inserted: recordsAdded,
                message: `Inserted ${recordsAdded} records...`,
              })
              .eq("session_id", progressSessionId);
          }

          // Fetch subawards for this prime award
          const awardId = result["Award ID"];
          const internalId = result["internal_id"] || result["generated_internal_id"];
          
          console.log(`Processing award: ${awardId}, internal_id: ${internalId}`);
          
          if (awardId && fundingRecord?.id) {
            try {
              // USAspending subawards API - try with the award ID
              const subawardResponse = await fetch(
                "https://api.usaspending.gov/api/v2/subawards/",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    award_id: awardId,
                    page: 1,
                    limit: 100,
                    order: "desc",
                    sort: "subaward_number",
                  }),
                }
              );

              console.log(`Subaward API response status for ${awardId}: ${subawardResponse.status}`);

              if (subawardResponse.ok) {
                const subawardData = await subawardResponse.json();
                const subawards = subawardData.results || [];
                
                console.log(`Found ${subawards.length} subawards for award ${awardId}`);

                for (const subaward of subawards) {
                  try {
                    const subawardRecipientName = subaward["sub_awardee_or_recipient_legal"] || subaward["Recipient Name"] || subaward["subawardee_name"];
                    const subawardAmount = parseFloat(subaward["subaward_amount"] || subaward["Subaward Amount"] || subaward["amount"]) || 0;
                    const subawardDate = subaward["action_date"] || subaward["subaward_action_date"] || subaward["Subaward Action Date"];
                    const subawardDescription = subaward["subaward_description"] || subaward["description"] || subaward["Subaward Description"];
                    const recipientState = subaward["sub_awardee_or_recipient_legal_entity_state_code"] || subaward["recipient_location_state_code"] || subaward["Recipient State Code"] || state;
                    const recipientCity = subaward["sub_awardee_or_recipient_legal_entity_city_name"] || subaward["recipient_location_city_name"] || subaward["Recipient City Name"];

                    console.log(`Subaward recipient: ${subawardRecipientName}, amount: ${subawardAmount}`);

                    if (!subawardRecipientName || subawardAmount === 0) {
                      console.log(`Skipping subaward - missing name or zero amount`);
                      continue;
                    }

                    // Check if subaward recipient organization exists
                    let subawardOrgId: string;
                    
                    const { data: existingSubOrg } = await supabaseClient
                      .from("organizations")
                      .select("id")
                      .eq("name", subawardRecipientName)
                      .eq("state", recipientState)
                      .maybeSingle();

                    if (existingSubOrg) {
                      subawardOrgId = existingSubOrg.id;
                    } else {
                      // Insert new subaward recipient organization
                      const { data: newSubOrg, error: subOrgError } = await supabaseClient
                        .from("organizations")
                        .insert({
                          name: subawardRecipientName,
                          state: recipientState,
                          city: recipientCity || null,
                          last_updated: new Date().toISOString().split("T")[0],
                        })
                        .select()
                        .single();

                      if (subOrgError) {
                        console.error("Error inserting subaward organization:", subOrgError);
                        continue;
                      }

                      subawardOrgId = newSubOrg.id;
                    }

                    // Insert subaward record
                    const { error: subawardError } = await supabaseClient
                      .from("subawards")
                      .insert({
                        funding_record_id: fundingRecord.id,
                        recipient_organization_id: subawardOrgId,
                        amount: subawardAmount,
                        award_date: subawardDate || null,
                        description: subawardDescription || null,
                      });

                    if (subawardError) {
                      console.error("Error inserting subaward:", subawardError);
                    } else {
                      console.log(`Successfully inserted subaward for ${subawardRecipientName}`);
                    }
                  } catch (subawardError) {
                    console.error("Error processing subaward:", subawardError);
                  }
                }
              } else {
                const errorText = await subawardResponse.text();
                console.error(`Subaward API error for ${awardId}: ${subawardResponse.status} - ${errorText}`);
              }
            } catch (subawardFetchError) {
              console.error(`Error fetching subawards for award ${awardId}:`, subawardFetchError);
            }
          }

        }
      } catch (error) {
        console.error("Error processing result:", error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        
        // Update progress with error
        if (errors.length <= 5) { // Only log first 5 errors to avoid bloat
          await supabaseClient
            .from("fetch_progress")
            .update({
              errors,
              message: `Error processing record: ${errorMsg}`,
            })
            .eq("session_id", progressSessionId);
        }
      }
    }

    // Count subawards created
    const { count: subawardCount } = await supabaseClient
      .from("subawards")
      .select("*", { count: "exact", head: true });

    console.log(`Successfully added ${recordsAdded} funding records and ${subawardCount || 0} subawards`);
    
    // Update final progress
    await supabaseClient
      .from("fetch_progress")
      .update({
        status: "completed",
        records_inserted: recordsAdded,
        errors,
        message: `Completed! Inserted ${recordsAdded} records with ${errors.length} errors.`,
      })
      .eq("session_id", progressSessionId);

    return new Response(
      JSON.stringify({
        success: true,
        recordsAdded,
        sessionId: progressSessionId,
        message: `Fetched and stored ${recordsAdded} funding records`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in fetch-usaspending-data function:", error);
    
    // Try to update progress with error status
    try {
      const { sessionId } = await req.json() as { sessionId?: string };
      if (sessionId) {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        
        await supabaseClient
          .from("fetch_progress")
          .update({
            status: "failed",
            message: error instanceof Error ? error.message : "Unknown error",
            errors: [error instanceof Error ? error.message : "Unknown error"],
          })
          .eq("session_id", sessionId);
      }
    } catch (updateError) {
      console.error("Error updating progress:", updateError);
    }
    
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
