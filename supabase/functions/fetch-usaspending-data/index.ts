import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

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
  state: string; // two-letter state code or "ALL"
  startDate?: string;
  endDate?: string;
  sessionId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication (signing-keys compatible)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Create client with anon key to verify the JWT via signing-keys
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.log("Unauthorized: getClaims failed", {
        claimsError: claimsError?.message ?? claimsError,
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Verify admin role
    const { data: roleData, error: roleError } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { state, startDate, endDate, sessionId } = await req.json() as RequestBody & { sessionId?: string };

    if (!state) {
      return new Response(
        JSON.stringify({ error: "State is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role client only after confirming admin privileges
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

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

    // Start background task for heavy processing
    if (state === "ALL") {
      EdgeRuntime.waitUntil(processAllStates(supabaseClient, startDate, endDate, progressSessionId));
    } else {
      EdgeRuntime.waitUntil(processData(supabaseClient, state, startDate, endDate, progressSessionId));
    }

    // Return immediately with session ID
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: progressSessionId,
        message: "Fetch started in background. Monitor progress via session ID.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error starting fetch:", error);
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

const US_STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

type UsStateCode = (typeof US_STATE_CODES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearAllUsaspendingData(supabaseClient: any) {
  const { data: fundingToClear, error: fundingSelectError } = await supabaseClient
    .from("funding_records")
    .select("id")
    .eq("source", "USAspending.gov");

  if (fundingSelectError) {
    console.error("Error fetching funding records to clear:", fundingSelectError);
    return;
  }

  const fundingIdsToClear = (fundingToClear || []).map((fr: any) => fr.id);
  if (fundingIdsToClear.length === 0) return;

  const { error: subawardsDeleteError } = await supabaseClient
    .from("subawards")
    .delete()
    .in("funding_record_id", fundingIdsToClear);

  if (subawardsDeleteError) {
    console.error("Error deleting existing subawards:", subawardsDeleteError);
  }

  const { error: fundingDeleteError } = await supabaseClient
    .from("funding_records")
    .delete()
    .in("id", fundingIdsToClear);

  if (fundingDeleteError) {
    console.error("Error deleting existing funding records:", fundingDeleteError);
  }

  console.log(`Cleared ${fundingIdsToClear.length} existing USAspending.gov records (ALL states)`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAllStates(
  supabaseClient: any,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
) {
  try {
    console.log("Starting ALL-states fetch...");

    await supabaseClient
      .from("fetch_progress")
      .update({
        total_pages: US_STATE_CODES.length,
        current_page: 0,
        message: `Clearing existing USAspending.gov data...`,
      })
      .eq("session_id", progressSessionId);

    await clearAllUsaspendingData(supabaseClient);

    let totalPrimeAwards = 0;

    for (let i = 0; i < US_STATE_CODES.length; i++) {
      const state = US_STATE_CODES[i] as UsStateCode;

      await supabaseClient
        .from("fetch_progress")
        .update({
          current_page: i + 1,
          message: `Fetching ${state} (${i + 1}/${US_STATE_CODES.length})...`,
        })
        .eq("session_id", progressSessionId);

      const recordsAdded = await processData(
        supabaseClient,
        state,
        startDate,
        endDate,
        progressSessionId,
        true,
      );

      totalPrimeAwards += recordsAdded;

      // Update aggregate progress
      await supabaseClient
        .from("fetch_progress")
        .update({
          records_inserted: totalPrimeAwards,
          message: `Fetched ${state}. Total prime awards inserted: ${totalPrimeAwards}`,
        })
        .eq("session_id", progressSessionId);
    }

    await supabaseClient
      .from("fetch_progress")
      .update({
        status: "completed",
        message: `Completed ALL states! Inserted ${totalPrimeAwards} prime awards total.`,
      })
      .eq("session_id", progressSessionId);
  } catch (error) {
    console.error("Error in ALL-states processing:", error);

    try {
      await supabaseClient
        .from("fetch_progress")
        .update({
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown error",
          errors: [error instanceof Error ? error.message : "Unknown error"],
        })
        .eq("session_id", progressSessionId);
    } catch (updateError) {
      console.error("Error updating progress:", updateError);
    }
  }
}

// Background processing function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processData(
  supabaseClient: any,
  state: string,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
  skipClear = false
): Promise<number> {
  try {
    console.log(`Fetching data for state: ${state}`);

    // Clear existing USAspending.gov data before fetching new data
    if (!skipClear) {
      // First, get all organizations for this state
      const { data: orgsForState, error: orgsError } = await supabaseClient
        .from("organizations")
        .select("id")
        .eq("state", state);

      if (orgsError) {
        console.error("Error fetching organizations:", orgsError);
      }

      const orgIdsForState = (orgsForState || []).map((org: any) => org.id);

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
          const fundingIdsToClear = (fundingToClear || []).map((fr: any) => fr.id);

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
              "Internal ID",
              "Recipient Name",
              "Recipient Location",
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
    const maxPages = 10;
    const totalPages = hasNext ? maxPages : 1; // If more pages exist, fetch up to 10 pages (max 1000 records)
    
    console.log(
      `Page 1 fetched. hasNext=${hasNext}. Will fetch up to ${totalPages} pages (max ${maxPages * 100} records).`,
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
                "Internal ID",
                "Recipient Name",
                "Recipient Location",
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
      (existingVerticals || []).map((v: any) => [v.name.toLowerCase(), v.id])
    );

    // Get existing grant types for CFDA matching
    const { data: grantTypes } = await supabaseClient
      .from("grant_types")
      .select("id, cfda_code, name");

    const grantTypeMap = new Map(
      (grantTypes || []).map((gt: any) => [gt.cfda_code, gt.id])
    );
    const grantTypeNameMap = new Map(
      (grantTypes || []).map((gt: any) => [gt.name.toLowerCase(), gt.id])
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
    
    existingFundingRecords?.forEach((record: any) => {
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

        // Get award IDs to store in notes for later subaward fetching
        const awardId = result["Award ID"];
        const internalId = result["Internal ID"] || result["internal_id"] || result["generated_internal_id"];
        
        // Store award IDs in notes so subawards can be fetched separately
        const notesWithAwardIds = `From USAspending.gov - ${awardingAgency}, internal_id:${internalId || ''}, award_id:${awardId || ''}`;

        // Insert funding record with last_updated timestamp and action_date
        const { error: fundingError } = await supabaseClient
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
            notes: notesWithAwardIds,
            source: "USAspending.gov",
            last_updated: new Date().toISOString(),
          });

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
                message: `Inserted ${recordsAdded} prime awards...`,
              })
              .eq("session_id", progressSessionId);
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

    console.log(`Successfully added ${recordsAdded} prime awards`);

    if (!skipClear) {
      // Update final progress (single-state mode)
      await supabaseClient
        .from("fetch_progress")
        .update({
          status: "completed",
          records_inserted: recordsAdded,
          errors,
          message: `Completed! Inserted ${recordsAdded} prime awards. Fetch subawards separately.`,
        })
        .eq("session_id", progressSessionId);
    }

    return recordsAdded;

  } catch (error) {
    console.error("Error in background processing:", error);

    // Update progress with error status
    try {
      await supabaseClient
        .from("fetch_progress")
        .update({
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown error",
          errors: [error instanceof Error ? error.message : "Unknown error"],
        })
        .eq("session_id", progressSessionId);
    } catch (updateError) {
      console.error("Error updating progress:", updateError);
    }

    throw error;
  }
}
