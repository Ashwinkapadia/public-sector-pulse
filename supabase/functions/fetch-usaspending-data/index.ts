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

function normalizeDateToYmd(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

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
  alnNumber?: string;
}

// Helper to update progress with a consistent shape
async function updateProgress(
  supabaseClient: any,
  sessionId: string,
  updates: Record<string, any>,
) {
  try {
    await supabaseClient
      .from("fetch_progress")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);
  } catch (e) {
    console.error("Progress update failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

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

    const { state, startDate, endDate, sessionId, alnNumber } = await req.json() as RequestBody;

    // State is required unless ALN numbers are provided (nationwide ALN search)
    if (!state && !alnNumber?.trim()) {
      return new Response(
        JSON.stringify({ error: "State or ALN number is required" }),
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

    const progressSessionId = sessionId || crypto.randomUUID();
    
    const { error: progressError } = await supabaseClient
      .from("fetch_progress")
      .upsert({
        session_id: progressSessionId,
        state,
        source: "USAspending.gov",
        status: "running",
        message: JSON.stringify({
          phase: "init",
          phaseLabel: "Initializing",
          apiPagesTotal: 0,
          apiPagesFetched: 0,
          apiResultsTotal: 0,
          recordsPrepared: 0,
          recordsInserted: 0,
          recordsTotal: 0,
          errors: [],
          startedAt: new Date().toISOString(),
        }),
        total_pages: 0,
        current_page: 0,
        records_inserted: 0,
        errors: [],
      });

    if (progressError) {
      console.error("Error creating progress:", progressError);
    }

    if (!state || state === "ALL") {
      EdgeRuntime.waitUntil(processAllStatesOrNationwide(supabaseClient, state, startDate, endDate, progressSessionId, alnNumber));
    } else {
      EdgeRuntime.waitUntil(processData(supabaseClient, state, startDate, endDate, progressSessionId, false, alnNumber));
    }

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

async function processAllStatesOrNationwide(
  supabaseClient: any,
  state: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
  alnNumber?: string,
) {
  // If no state specified (ALN-only nationwide search), do a single nationwide fetch
  if (!state) {
    const startedAt = new Date().toISOString();
    try {
      await updateProgress(supabaseClient, progressSessionId, {
        message: JSON.stringify({
          phase: "api_fetch",
          phaseLabel: "Fetching nationwide data by ALN...",
          apiPagesTotal: 0,
          apiPagesFetched: 0,
          apiResultsTotal: 0,
          recordsPrepared: 0,
          recordsInserted: 0,
          recordsTotal: 0,
          errors: [],
          startedAt,
        }),
      });

      const recordsAdded = await processData(supabaseClient, undefined, startDate, endDate, progressSessionId, true, alnNumber);

      await updateProgress(supabaseClient, progressSessionId, {
        status: "completed",
        records_inserted: recordsAdded,
        message: JSON.stringify({
          phase: "completed",
          phaseLabel: `Completed! Inserted ${recordsAdded} prime awards nationwide.`,
          recordsInserted: recordsAdded,
          errors: [],
          startedAt,
          completedAt: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Error in nationwide processing:", error);
      await updateProgress(supabaseClient, progressSessionId, {
        status: "failed",
        errors: [error instanceof Error ? error.message : "Unknown error"],
        message: JSON.stringify({
          phase: "failed",
          phaseLabel: error instanceof Error ? error.message : "Unknown error",
          errors: [error instanceof Error ? error.message : "Unknown error"],
          startedAt,
        }),
      });
    }
    return;
  }

  // Original ALL-states logic
  return processAllStates(supabaseClient, startDate, endDate, progressSessionId, alnNumber);
}

async function processAllStates(
  supabaseClient: any,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
  alnNumber?: string,
) {
  const startedAt = new Date().toISOString();
  try {
    console.log("Starting ALL-states fetch...");

    await updateProgress(supabaseClient, progressSessionId, {
      message: JSON.stringify({
        phase: "clearing",
        phaseLabel: "Clearing existing data",
        apiPagesTotal: 0,
        apiPagesFetched: 0,
        apiResultsTotal: 0,
        recordsPrepared: 0,
        recordsInserted: 0,
        recordsTotal: 0,
        statesTotal: US_STATE_CODES.length,
        statesCompleted: 0,
        errors: [],
        startedAt,
      }),
      total_pages: US_STATE_CODES.length,
      current_page: 0,
    });

    await clearAllUsaspendingData(supabaseClient);

    let totalPrimeAwards = 0;
    const errors: string[] = [];

    for (let i = 0; i < US_STATE_CODES.length; i++) {
      const state = US_STATE_CODES[i] as UsStateCode;

      await updateProgress(supabaseClient, progressSessionId, {
        current_page: i + 1,
        message: JSON.stringify({
          phase: "fetching_state",
          phaseLabel: `Fetching ${state} (${i + 1}/${US_STATE_CODES.length})`,
          apiPagesTotal: 0,
          apiPagesFetched: 0,
          apiResultsTotal: 0,
          recordsPrepared: 0,
          recordsInserted: totalPrimeAwards,
          recordsTotal: 0,
          statesTotal: US_STATE_CODES.length,
          statesCompleted: i,
          currentState: state,
          errors,
          startedAt,
        }),
      });

      const recordsAdded = await processData(
        supabaseClient,
        state,
        startDate,
        endDate,
        progressSessionId,
        true,
        alnNumber,
      );

      totalPrimeAwards += recordsAdded;

      await updateProgress(supabaseClient, progressSessionId, {
        records_inserted: totalPrimeAwards,
        message: JSON.stringify({
          phase: "fetching_state",
          phaseLabel: `Completed ${state}`,
          apiPagesTotal: 0,
          apiPagesFetched: 0,
          apiResultsTotal: 0,
          recordsPrepared: 0,
          recordsInserted: totalPrimeAwards,
          recordsTotal: 0,
          statesTotal: US_STATE_CODES.length,
          statesCompleted: i + 1,
          currentState: state,
          errors,
          startedAt,
        }),
      });
    }

    await updateProgress(supabaseClient, progressSessionId, {
      status: "completed",
      records_inserted: totalPrimeAwards,
      message: JSON.stringify({
        phase: "completed",
        phaseLabel: `Completed! Inserted ${totalPrimeAwards} prime awards across all states.`,
        recordsInserted: totalPrimeAwards,
        statesTotal: US_STATE_CODES.length,
        statesCompleted: US_STATE_CODES.length,
        errors,
        startedAt,
        completedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Error in ALL-states processing:", error);
    await updateProgress(supabaseClient, progressSessionId, {
      status: "failed",
      errors: [error instanceof Error ? error.message : "Unknown error"],
      message: JSON.stringify({
        phase: "failed",
        phaseLabel: error instanceof Error ? error.message : "Unknown error",
        errors: [error instanceof Error ? error.message : "Unknown error"],
        startedAt,
      }),
    });
  }
}

// Background processing function
async function processData(
  supabaseClient: any,
  state: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  progressSessionId: string,
  skipClear = false,
  alnNumber?: string,
): Promise<number> {
  // Read existing progress to get startedAt
  let startedAt = new Date().toISOString();
  try {
    const { data: existingProgress } = await supabaseClient
      .from("fetch_progress")
      .select("message")
      .eq("session_id", progressSessionId)
      .single();
    if (existingProgress?.message) {
      try {
        const parsed = JSON.parse(existingProgress.message);
        if (parsed.startedAt) startedAt = parsed.startedAt;
      } catch {}
    }
  } catch {}

  try {
    console.log(`Fetching data for state: ${state || "NATIONWIDE"}`);

    // --- CLEAR PHASE ---
    if (!skipClear) {
      await updateProgress(supabaseClient, progressSessionId, {
        message: JSON.stringify({
          phase: "clearing",
          phaseLabel: `Clearing existing ${state} data...`,
          apiPagesTotal: 0,
          apiPagesFetched: 0,
          apiResultsTotal: 0,
          recordsPrepared: 0,
          recordsInserted: 0,
          recordsTotal: 0,
          errors: [],
          startedAt,
        }),
      });

      const { data: orgsForState, error: orgsError } = await supabaseClient
        .from("organizations")
        .select("id")
        .eq("state", state);

      if (orgsError) {
        console.error("Error fetching organizations:", orgsError);
      }

      const orgIdsForState = (orgsForState || []).map((org: any) => org.id);

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

            console.log(`Cleared ${fundingIdsToClear.length} existing USAspending.gov records for ${state}`);
          }
        }
      }
    }

    // --- API FETCH PHASE ---
    const currentYear = new Date().getFullYear();
    const fiscalYear = startDate
      ? new Date(startDate).getFullYear()
      : currentYear;

    const filters: any = {
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
      recipient_type_names: [
        "Authorities and Commissions",
        "Local Government",
        "Regional and State Government",
        "Interstate Entity",
        "Indian Native American Tribal Government",
        "Government",
        "Regional Organization",
        "U.S. Territory or Possession",
        "Council of Governments",
        "National Government",
      ],
    };

    if (alnNumber?.trim()) {
      const alnList = alnNumber.split(",").map(c => c.trim()).filter(c => c.length > 0);
      if (alnList.length > 0) {
        filters.program_numbers = alnList;
        console.log("Filtering by ALN:", alnList);
      }
    }

    await updateProgress(supabaseClient, progressSessionId, {
      message: JSON.stringify({
        phase: "api_fetch",
        phaseLabel: `Fetching page 1 from USAspending API...`,
        apiPagesTotal: 0,
        apiPagesFetched: 0,
        apiResultsTotal: 0,
        recordsPrepared: 0,
        recordsInserted: 0,
        recordsTotal: 0,
        errors: [],
        startedAt,
      }),
    });

    const apiFields = [
      "Award ID",
      "generated_internal_id",
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
      "Assistance Listings",
    ];

    const searchResponse = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_by_award/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters,
          fields: apiFields,
          subawards: false,
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
    const page1Results = searchData.results || [];
    console.log(`Found ${page1Results.length} results from page 1`);

    let allResults = page1Results;
    let currentHasNext = searchData.page_metadata?.hasNext ?? false;
    const maxPages = 10;
    let apiPagesFetched = 1;

    await updateProgress(supabaseClient, progressSessionId, {
      total_pages: 1,
      current_page: 1,
      message: JSON.stringify({
        phase: "api_fetch",
        phaseLabel: `Fetched page 1 (${page1Results.length} results)${currentHasNext ? ', fetching more...' : ''}`,
        apiPagesTotal: currentHasNext ? '?' : 1,
        apiPagesFetched: 1,
        apiResultsTotal: allResults.length,
        recordsPrepared: 0,
        recordsInserted: 0,
        recordsTotal: 0,
        errors: [],
        startedAt,
      }),
    });

    let page = 2;
    while (currentHasNext && page <= maxPages) {
      const pageResponse = await fetch(
        "https://api.usaspending.gov/api/v2/search/spending_by_award/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters,
            fields: apiFields,
            subawards: false,
            limit: 100,
            page: page,
            order: "desc",
            sort: "Award Amount",
          }),
        }
      );

      if (!pageResponse.ok) {
        console.warn(`Page ${page} request failed, stopping pagination.`);
        break;
      }

      const pageData = await pageResponse.json();
      const pageResults = pageData.results || [];
      console.log(`Found ${pageResults.length} results from page ${page}`);

      if (pageResults.length === 0) {
        console.log(`Page ${page} returned 0 results; stopping.`);
        break;
      }

      allResults = allResults.concat(pageResults);
      apiPagesFetched = page;
      currentHasNext = pageData.page_metadata?.hasNext ?? false;

      await updateProgress(supabaseClient, progressSessionId, {
        total_pages: apiPagesFetched,
        current_page: apiPagesFetched,
        message: JSON.stringify({
          phase: "api_fetch",
          phaseLabel: `Fetched page ${page} (${allResults.length} total results)${currentHasNext ? ', fetching more...' : ''}`,
          apiPagesTotal: currentHasNext ? apiPagesFetched + '+' : apiPagesFetched,
          apiPagesFetched,
          apiResultsTotal: allResults.length,
          recordsPrepared: 0,
          recordsInserted: 0,
          recordsTotal: 0,
          errors: [],
          startedAt,
        }),
      });

      page++;
    }

    console.log(`Total results fetched: ${allResults.length} across ${apiPagesFetched} pages`);

    // --- PROCESSING PHASE ---
    await updateProgress(supabaseClient, progressSessionId, {
      total_pages: apiPagesFetched,
      current_page: apiPagesFetched,
      message: JSON.stringify({
        phase: "processing",
        phaseLabel: `Processing ${allResults.length} API results...`,
        apiPagesTotal: apiPagesFetched,
        apiPagesFetched,
        apiResultsTotal: allResults.length,
        recordsPrepared: 0,
        recordsInserted: 0,
        recordsTotal: 0,
        errors: [],
        startedAt,
      }),
    });

    // Get existing verticals
    const { data: existingVerticals } = await supabaseClient
      .from("verticals")
      .select("id, name");

    const verticalMap = new Map(
      (existingVerticals || []).map((v: any) => [v.name.toLowerCase(), v.id])
    );

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
    const errors: string[] = [];

    const existingRecords = new Set<string>();
    const { data: existingFundingRecords } = await supabaseClient
      .from("funding_records")
      .select("organization_id, amount, fiscal_year, action_date, source")
      .eq("source", "USAspending.gov");
    
    existingFundingRecords?.forEach((record: any) => {
      existingRecords.add(`${record.organization_id}-${record.amount}-${record.fiscal_year}-${record.action_date || ''}`);
    });

    // --- PHASE 1: Resolve organizations ---
    const uniqueOrgNames = new Set<string>();
    for (const result of allResults) {
      const name = result["Recipient Name"];
      if (name) uniqueOrgNames.add(name);
    }

    await updateProgress(supabaseClient, progressSessionId, {
      message: JSON.stringify({
        phase: "processing",
        phaseLabel: `Resolving ${uniqueOrgNames.size} organizations...`,
        apiPagesTotal: apiPagesFetched,
        apiPagesFetched,
        apiResultsTotal: allResults.length,
        recordsPrepared: 0,
        recordsInserted: 0,
        recordsTotal: 0,
        errors,
        startedAt,
      }),
    });

    const { data: existingOrgs } = await supabaseClient
      .from("organizations")
      .select("id, name")
      .eq("state", state);

    const orgNameToId = new Map<string, string>();
    (existingOrgs || []).forEach((org: any) => orgNameToId.set(org.name, org.id));

    const newOrgNames = Array.from(uniqueOrgNames).filter(n => !orgNameToId.has(n));
    if (newOrgNames.length > 0) {
      for (let i = 0; i < newOrgNames.length; i += 200) {
        const batch = newOrgNames.slice(i, i + 200).map(name => ({
          name,
          state,
          last_updated: new Date().toISOString().split("T")[0],
        }));
        const { data: inserted, error: insertErr } = await supabaseClient
          .from("organizations")
          .insert(batch)
          .select("id, name");
        if (insertErr) {
          console.error("Batch org insert error:", insertErr);
        } else {
          (inserted || []).forEach((org: any) => orgNameToId.set(org.name, org.id));
        }
      }
    }

    console.log(`Resolved ${orgNameToId.size} organizations (${newOrgNames.length} new)`);

    // --- PHASE 2: Prepare funding records ---
    const fundingBatch: any[] = [];

    for (const result of allResults) {
      try {
        const recipientName = result["Recipient Name"];
        const awardAmount = parseFloat(result["Award Amount"]) || 0;
        const awardingAgency = result["Awarding Agency"] || "Unknown";
        const startDateStr = normalizeDateToYmd(result["Start Date"]);
        const endDateStr = normalizeDateToYmd(result["End Date"]);
        const actionDateStr = normalizeDateToYmd(result["Action Date"])
          || startDateStr
          || endDateStr
          || (startDate ? normalizeDateToYmd(startDate) : null)
          || `${fiscalYear}-01-01`;
        const cfdaNumber = result["CFDA Number"];
        const assistanceListings = result["Assistance Listings"];
        const cfdaTitle = assistanceListings?.title || assistanceListings?.program_title || "";

        let grantTypeId = null;
        if (cfdaNumber) grantTypeId = grantTypeMap.get(cfdaNumber) || null;
        if (!grantTypeId && cfdaTitle) grantTypeId = grantTypeNameMap.get(cfdaTitle.toLowerCase()) || null;

        const description = result["Description"] || "";
        const subAgency = result["Awarding Sub Agency"] || "";
        const combinedText = `${cfdaTitle} ${description} ${awardingAgency} ${subAgency} ${recipientName}`.toLowerCase();
        
        let verticalName = "Other";
        if (combinedText.match(/\b(workforce|employment|job training|career|apprentice|labor|occupational|vocational training|wioa)\b/)) {
          verticalName = "Workforce Development";
        } else if (combinedText.match(/\b(aging|elderly|senior|older adult|elder care|geriatric|nutrition for the elderly|meals on wheels|title iii|older americans|area agency on aging|aoa)\b/)) {
          verticalName = "Aging Services";
        } else if (combinedText.match(/\b(veteran|veterans|va medical|military service|veteran affairs)\b/)) {
          verticalName = "Veterans";
        } else if (combinedText.match(/\b(violence intervention|violence prevention|community violence|crime prevention|juvenile justice|gang|victim)\b/)) {
          verticalName = "CVI Prevention";
        } else if (combinedText.match(/\b(home visiting|maternal health|child health|early childhood|home visitation|maternal infant|prenatal|postpartum|family support|healthy start)\b/)) {
          verticalName = "Home Visiting";
        } else if (combinedText.match(/\b(reentry|re-entry|prisoner reintegration|correctional|prison|incarceration|offender|recidivism|post-release|second chance)\b/)) {
          verticalName = "Re-entry";
        } else if (combinedText.match(/\b(energy|renewable|solar|wind|climate|environment|conservation|emission|carbon|battery|electric|hydrogen|green|sustainable|recycl)\b/)) {
          verticalName = "Energy & Environment";
        } else if (combinedText.match(/\b(transportation|transit|highway|airport|port|infrastructure|rail|bridge|road|traffic)\b/)) {
          verticalName = "Transportation & Infrastructure";
        } else if (combinedText.match(/\b(university|college|higher education|postsecondary|post-secondary|graduate|undergraduate|pell grant|student aid|student loan|federal student|title iv|fafsa)\b/)) {
          verticalName = "Higher Education";
        } else if (combinedText.match(/\b(k-12|k12|elementary|secondary|school district|public school|title i |head start|idea |special education|charter school)\b/)) {
          verticalName = "K-12 Education";
        } else if (combinedText.match(/\b(education|school|student|academic|learning|literacy|teach)\b/)) {
          verticalName = "Education";
        } else if (combinedText.match(/\b(medicaid|chip|children.s health insurance)\b/)) {
          verticalName = "Medicaid";
        } else if (combinedText.match(/\b(public health|epidemiol|disease control|cdc|immunization|vaccination|pandemic|preparedness|surveillance)\b/)) {
          verticalName = "Public Health";
        } else if (combinedText.match(/\b(public safety|law enforcement|police|fire|emergency management|homeland|fema|disaster)\b/)) {
          verticalName = "Public Safety";
        } else if (combinedText.match(/\b(health|medical|hospital|clinic|disease|mental health|substance abuse|treatment|patient|care)\b/)) {
          verticalName = "Healthcare";
        }

        const verticalId = verticalMap.get(verticalName.toLowerCase());
        if (!verticalId) continue;

        const organizationId = orgNameToId.get(recipientName);
        if (!organizationId) continue;

        const recordKey = `${organizationId}-${awardAmount}-${fiscalYear}-${actionDateStr || ''}`;
        if (existingRecords.has(recordKey)) continue;
        existingRecords.add(recordKey);

        const awardId = result["Award ID"];
        const internalId = result["generated_internal_id"];

        fundingBatch.push({
          organization_id: organizationId,
          vertical_id: verticalId,
          amount: awardAmount,
          status: "Active",
          fiscal_year: fiscalYear,
          date_range_start: startDateStr,
          date_range_end: endDateStr,
          action_date: actionDateStr,
          cfda_code: cfdaNumber || null,
          grant_type_id: grantTypeId,
          notes: `From USAspending.gov - ${awardingAgency}, internal_id:${internalId || ''}, award_id:${awardId || ''}`,
          source: "USAspending.gov",
          last_updated: new Date().toISOString(),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
      }
    }

    // --- PHASE 3: Insert funding records ---
    await updateProgress(supabaseClient, progressSessionId, {
      message: JSON.stringify({
        phase: "inserting",
        phaseLabel: `Inserting ${fundingBatch.length} records into database...`,
        apiPagesTotal: apiPagesFetched,
        apiPagesFetched,
        apiResultsTotal: allResults.length,
        recordsPrepared: fundingBatch.length,
        recordsInserted: 0,
        recordsTotal: fundingBatch.length,
        errors,
        startedAt,
      }),
    });

    const BATCH_SIZE = 200;
    for (let i = 0; i < fundingBatch.length; i += BATCH_SIZE) {
      const batch = fundingBatch.slice(i, i + BATCH_SIZE);
      const { error: batchErr, data: batchData } = await supabaseClient
        .from("funding_records")
        .insert(batch)
        .select("id");

      if (batchErr) {
        console.error(`Batch insert error (batch ${i / BATCH_SIZE + 1}):`, batchErr);
        errors.push(`Batch insert failed: ${batchErr.message}`);
      } else {
        recordsAdded += (batchData || []).length;
      }

      await updateProgress(supabaseClient, progressSessionId, {
        records_inserted: recordsAdded,
        message: JSON.stringify({
          phase: "inserting",
          phaseLabel: `Inserted ${recordsAdded} of ${fundingBatch.length} records...`,
          apiPagesTotal: apiPagesFetched,
          apiPagesFetched,
          apiResultsTotal: allResults.length,
          recordsPrepared: fundingBatch.length,
          recordsInserted: recordsAdded,
          recordsTotal: fundingBatch.length,
          errors,
          startedAt,
        }),
      });
    }

    console.log(`Successfully added ${recordsAdded} prime awards`);

    if (!skipClear) {
      await updateProgress(supabaseClient, progressSessionId, {
        status: "completed",
        records_inserted: recordsAdded,
        errors,
        message: JSON.stringify({
          phase: "completed",
          phaseLabel: `Completed! Inserted ${recordsAdded} prime awards.`,
          apiPagesTotal: apiPagesFetched,
          apiPagesFetched,
          apiResultsTotal: allResults.length,
          recordsPrepared: fundingBatch.length,
          recordsInserted: recordsAdded,
          recordsTotal: fundingBatch.length,
          errors,
          startedAt,
          completedAt: new Date().toISOString(),
        }),
      });
    }

    return recordsAdded;

  } catch (error) {
    console.error("Error in background processing:", error);

    try {
      await supabaseClient
        .from("fetch_progress")
        .update({
          status: "failed",
          message: JSON.stringify({
            phase: "failed",
            phaseLabel: error instanceof Error ? error.message : "Unknown error",
            errors: [error instanceof Error ? error.message : "Unknown error"],
          }),
          errors: [error instanceof Error ? error.message : "Unknown error"],
        })
        .eq("session_id", progressSessionId);
    } catch (updateError) {
      console.error("Error updating progress:", updateError);
    }

    throw error;
  }
}
