import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { state, startDate, endDate, sessionId } = await req.json() as RequestBody;

    if (!state) {
      return new Response(
        JSON.stringify({ error: "State is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
        source: "USAspending.gov-Subawards",
        status: "running",
        message: "Starting subaward fetch...",
        total_pages: 0,
        current_page: 0,
        records_inserted: 0,
        errors: [],
      });

    if (progressError) {
      console.error("Error creating progress:", progressError);
    }

    // Start background task for subaward fetching
    if (state === "ALL") {
      EdgeRuntime.waitUntil(processAllStatesSubawards(supabaseClient, startDate, endDate, progressSessionId));
    } else {
      EdgeRuntime.waitUntil(processSubawards(supabaseClient, state, startDate, endDate, progressSessionId));
    }

    // Return immediately with session ID
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: progressSessionId,
        message: "Subaward fetch started in background. Monitor progress via session ID.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error starting subaward fetch:", error);
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
async function processAllStatesSubawards(
  supabaseClient: any,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string
) {
  console.log("Processing subawards for ALL states...");
  
  let totalSubawards = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < US_STATE_CODES.length; i++) {
    const stateCode = US_STATE_CODES[i];
    
    try {
      await supabaseClient
        .from("fetch_progress")
        .update({
          message: `Fetching subawards for ${stateCode} (${i + 1}/${US_STATE_CODES.length})...`,
          current_page: i + 1,
          total_pages: US_STATE_CODES.length,
        })
        .eq("session_id", progressSessionId);

      const stateSubawards = await processSubawards(
        supabaseClient,
        stateCode,
        startDate,
        endDate,
        progressSessionId,
        true // skipProgressUpdate
      );
      
      totalSubawards += stateSubawards;
      console.log(`Completed ${stateCode}: ${stateSubawards} subawards`);
      
    } catch (error) {
      const errorMsg = `Error processing ${stateCode}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  // Update final progress
  await supabaseClient
    .from("fetch_progress")
    .update({
      status: "completed",
      records_inserted: totalSubawards,
      errors,
      message: `Completed! Inserted ${totalSubawards} subawards from all states.`,
    })
    .eq("session_id", progressSessionId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processSubawards(
  supabaseClient: any,
  state: string,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
  skipProgressUpdate = false
): Promise<number> {
  try {
    console.log(`Fetching subawards for state: ${state}`);

    // First, get all funding records for this state that we can fetch subawards for
    let fundingQuery = supabaseClient
      .from("funding_records")
      .select(`
        id,
        notes,
        organization:organizations!funding_records_organization_id_fkey(
          state
        )
      `)
      .eq("source", "USAspending.gov");

    // Filter by organization state
    if (state !== "ALL") {
      fundingQuery = fundingQuery.eq("organization.state", state);
    }

    // Apply date filters
    if (startDate) {
      fundingQuery = fundingQuery.gte("action_date", startDate);
    }
    if (endDate) {
      fundingQuery = fundingQuery.lte("action_date", endDate);
    }

    const { data: fundingRecords, error: fundingError } = await fundingQuery;

    if (fundingError) {
      console.error("Error fetching funding records:", fundingError);
      throw fundingError;
    }

    // Filter out records where organization.state is null (due to LEFT JOIN)
    const validRecords = (fundingRecords || []).filter((r: any) => r.organization?.state);
    console.log(`Found ${validRecords.length} funding records for state ${state}`);

    if (validRecords.length === 0) {
      if (!skipProgressUpdate) {
        await supabaseClient
          .from("fetch_progress")
          .update({
            status: "completed",
            records_inserted: 0,
            message: `No funding records found for ${state}. Fetch prime awards first.`,
          })
          .eq("session_id", progressSessionId);
      }
      return 0;
    }

    // Extract award IDs from notes field (stored during prime award fetch)
    const awardsToFetch: Array<{ fundingRecordId: string; awardId: string }> = [];
    
    for (const record of validRecords) {
      // The notes field contains the internal award ID from USAspending
      const notes = record.notes || "";
      
      // Try to extract internal_id from notes (format: "internal_id:XXXXX")
      const internalIdMatch = notes.match(/internal_id:([^\s,]+)/);
      const awardIdMatch = notes.match(/award_id:([^\s,]+)/);
      
      const awardId = internalIdMatch?.[1] || awardIdMatch?.[1];
      
      if (awardId) {
        awardsToFetch.push({
          fundingRecordId: record.id,
          awardId: awardId,
        });
      }
    }

    console.log(`Found ${awardsToFetch.length} awards with IDs to fetch subawards`);

    if (awardsToFetch.length === 0) {
      if (!skipProgressUpdate) {
        await supabaseClient
          .from("fetch_progress")
          .update({
            status: "completed",
            records_inserted: 0,
            message: `No award IDs found. Prime awards may not have subaward data.`,
          })
          .eq("session_id", progressSessionId);
      }
      return 0;
    }

    let subawardsAdded = 0;
    const errors: string[] = [];
    const filterStartDate = startDate ? new Date(startDate) : null;
    const filterEndDate = endDate ? new Date(endDate) : null;

    if (!skipProgressUpdate) {
      await supabaseClient
        .from("fetch_progress")
        .update({
          message: `Processing ${awardsToFetch.length} awards for subawards...`,
          total_pages: awardsToFetch.length,
          current_page: 0,
        })
        .eq("session_id", progressSessionId);
    }

    for (let i = 0; i < awardsToFetch.length; i++) {
      const award = awardsToFetch[i];
      
      try {
        // Check if we already have subawards for this funding record
        const { count: existingCount } = await supabaseClient
          .from("subawards")
          .select("id", { count: "exact", head: true })
          .eq("funding_record_id", award.fundingRecordId);

        if (existingCount && existingCount > 0) {
          console.log(`Skipping award ${award.awardId} - already has ${existingCount} subawards`);
          continue;
        }

        // Fetch subawards from USAspending API
        const subawardResponse = await fetch(
          "https://api.usaspending.gov/api/v2/subawards/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              award_id: award.awardId,
              page: 1,
              limit: 100,
              order: "desc",
              sort: "subaward_number",
            }),
          }
        );

        if (!subawardResponse.ok) {
          console.error(`Subaward API error for ${award.awardId}: ${subawardResponse.status}`);
          continue;
        }

        const subawardData = await subawardResponse.json();
        const subawards = subawardData.results || [];
        
        console.log(`Found ${subawards.length} subawards for award ${award.awardId}`);

        for (const subaward of subawards) {
          try {
            const subawardRecipientName = 
              subaward["sub_awardee_or_recipient_legal_business_name"] || 
              subaward["sub_awardee_or_recipient_legal_entity_name"] ||
              subaward["sub_awardee_or_recipient_legal"] || 
              subaward["recipient_name"] ||
              subaward["subawardee_name"];
            const subawardAmount = parseFloat(subaward["subaward_amount"] || subaward["amount"] || "0") || 0;
            const subawardDate = subaward["sub_action_date"] || subaward["action_date"] || subaward["subaward_action_date"];
            const subawardDescription = subaward["subaward_description"] || subaward["description"];
            const recipientState = 
              subaward["sub_legal_entity_state_code"] ||
              subaward["sub_awardee_or_recipient_legal_entity_state_code"] || 
              subaward["recipient_location_state_code"] || 
              state;
            const recipientCity = 
              subaward["sub_legal_entity_city_name"] ||
              subaward["sub_awardee_or_recipient_legal_entity_city_name"] || 
              subaward["recipient_location_city_name"];

            // Filter subaward by date range
            if (subawardDate) {
              const subawardDateObj = new Date(subawardDate);
              if (filterStartDate && subawardDateObj < filterStartDate) {
                continue;
              }
              if (filterEndDate && subawardDateObj > filterEndDate) {
                continue;
              }
            }

            if (!subawardRecipientName || subawardAmount === 0) {
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
                funding_record_id: award.fundingRecordId,
                recipient_organization_id: subawardOrgId,
                amount: subawardAmount,
                award_date: subawardDate || null,
                description: subawardDescription || null,
              });

            if (subawardError) {
              console.error("Error inserting subaward:", subawardError);
            } else {
              subawardsAdded++;
            }
          } catch (subawardError) {
            console.error("Error processing subaward:", subawardError);
          }
        }

        // Update progress every 10 awards
        if (!skipProgressUpdate && (i + 1) % 10 === 0) {
          await supabaseClient
            .from("fetch_progress")
            .update({
              current_page: i + 1,
              records_inserted: subawardsAdded,
              message: `Processed ${i + 1}/${awardsToFetch.length} awards, ${subawardsAdded} subawards added...`,
            })
            .eq("session_id", progressSessionId);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Award ${award.awardId}: ${errorMsg}`);
        console.error(`Error fetching subawards for award ${award.awardId}:`, error);
      }
    }

    console.log(`Successfully added ${subawardsAdded} subawards for state ${state}`);

    if (!skipProgressUpdate) {
      await supabaseClient
        .from("fetch_progress")
        .update({
          status: "completed",
          records_inserted: subawardsAdded,
          errors,
          message: `Completed! Inserted ${subawardsAdded} subawards.`,
        })
        .eq("session_id", progressSessionId);
    }

    return subawardsAdded;

  } catch (error) {
    console.error("Error in subaward processing:", error);

    if (!skipProgressUpdate) {
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

    throw error;
  }
}
