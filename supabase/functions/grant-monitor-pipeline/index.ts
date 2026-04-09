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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { action, scheduleId, alns, lookbackMonths, startDate: reqStartDate, endDate: reqEndDate } = await req.json();

    // For cron-triggered scheduled runs, skip user auth
    if (action === "run_scheduled") {
      // Verify the request has a valid auth header (anon key is fine for cron)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Process scheduled runs (handled below)
    } else {
      // For manual runs, require a valid user session
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Store user on a variable accessible to the rest of the function
      (globalThis as any).__currentUser = user;
    }

    let user = (globalThis as any).__currentUser;

    if (action === "run_pipeline") {
      // Determine ALNs and email from schedule or manual params
      let targetAlns: string[] = alns || [];
      let emailAddress = "";
      let lookback = lookbackMonths || 3;
      let verticalIds: string[] = [];

      if (scheduleId) {
        const { data: schedule, error: schedErr } = await serviceClient
          .from("grant_monitor_schedules")
          .select("*")
          .eq("id", scheduleId)
          .single();

        if (schedErr || !schedule) {
          return new Response(JSON.stringify({ error: "Schedule not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        emailAddress = schedule.email_address;
        lookback = schedule.lookback_months || 3;
        verticalIds = schedule.vertical_ids || [];

        // Step 1: Search Grants.gov for new grants
        const alnPrefixes = getAlnPrefixesForVerticals(verticalIds);
        const grants = await searchGrantsGov(alnPrefixes);
        targetAlns = [...new Set(grants.map((g: any) => g.aln).filter(Boolean))];

        // Update schedule last_run
        const now = new Date();
        let nextRun: Date;
        if (schedule.frequency === "daily") nextRun = new Date(now.getTime() + 86400000);
        else if (schedule.frequency === "weekly") nextRun = new Date(now.getTime() + 7 * 86400000);
        else nextRun = new Date(now.getTime() + 30 * 86400000);

        await serviceClient
          .from("grant_monitor_schedules")
          .update({ last_run_at: now.toISOString(), next_run_at: nextRun.toISOString() })
          .eq("id", scheduleId);
      }

      if (targetAlns.length === 0) {
        return new Response(
          JSON.stringify({ error: "No ALNs to process" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create run record
      const { data: run, error: runErr } = await serviceClient
        .from("grant_monitor_runs")
        .insert({
          schedule_id: scheduleId || null,
          user_id: user.id,
          status: "running",
          unique_alns: targetAlns,
          grants_found: targetAlns.length,
        })
        .select()
        .single();

      if (runErr) {
        return new Response(JSON.stringify({ error: "Failed to create run record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return immediately, run pipeline in background
      const promise = runPipeline(serviceClient, run.id, targetAlns, lookback, emailAddress || "", reqStartDate, reqEndDate);
      // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(promise);
      }

      return new Response(
        JSON.stringify({ success: true, runId: run.id, message: "Pipeline started" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: run_scheduled (called by cron)
    if (action === "run_scheduled") {
      const now = new Date().toISOString();
      const { data: dueSchedules } = await serviceClient
        .from("grant_monitor_schedules")
        .select("*")
        .eq("is_active", true)
        .lte("next_run_at", now);

      if (!dueSchedules?.length) {
        return new Response(
          JSON.stringify({ message: "No schedules due" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: any[] = [];
      for (const schedule of dueSchedules) {
        try {
          const alnPrefixes = getAlnPrefixesForVerticals(schedule.vertical_ids || []);
          const grants = await searchGrantsGov(alnPrefixes);
          const alns = [...new Set(grants.map((g: any) => g.aln).filter(Boolean))];

          if (alns.length === 0) {
            results.push({ scheduleId: schedule.id, status: "no_alns" });
            continue;
          }

          const { data: run } = await serviceClient
            .from("grant_monitor_runs")
            .insert({
              schedule_id: schedule.id,
              user_id: schedule.user_id,
              status: "running",
              unique_alns: alns,
              grants_found: grants.length,
            })
            .select()
            .single();

          if (run) {
            await runPipeline(serviceClient, run.id, alns, schedule.lookback_months || 3, schedule.email_address, undefined, undefined);
          }

          // Update schedule
          const nowDate = new Date();
          let nextRun: Date;
          if (schedule.frequency === "daily") nextRun = new Date(nowDate.getTime() + 86400000);
          else if (schedule.frequency === "weekly") nextRun = new Date(nowDate.getTime() + 7 * 86400000);
          else nextRun = new Date(nowDate.getTime() + 30 * 86400000);

          await serviceClient
            .from("grant_monitor_schedules")
            .update({ last_run_at: nowDate.toISOString(), next_run_at: nextRun.toISOString() })
            .eq("id", schedule.id);

          results.push({ scheduleId: schedule.id, status: "started", runId: run?.id });
        } catch (err: any) {
          results.push({ scheduleId: schedule.id, status: "error", error: err.message });
        }
      }

      return new Response(
        JSON.stringify({ processed: results.length, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Vertical → ALN prefix mapping ───
const VERTICAL_MAPPINGS: Record<string, string[]> = {
  "Aging Services": ["93"],
  "CVI Prevention": ["16"],
  "Education": ["84"],
  "Energy & Environment": ["81", "66"],
  "Healthcare": ["93"],
  "Higher Education": ["84"],
  "Home Visiting": ["93"],
  "K-12 Education": ["84"],
  "Medicaid": ["93"],
  "Public Health": ["93"],
  "Public Safety": ["16", "97"],
  "Re-entry": ["16"],
  "Transportation": ["20"],
  "Transportation & Infrastructure": ["20"],
  "Veterans": ["64"],
  "Workforce Development": ["17"],
  "Other": [],
};

function getAlnPrefixesForVerticals(verticals: string[]): string[] {
  const prefixes = new Set<string>();
  for (const v of verticals) {
    const mapped = VERTICAL_MAPPINGS[v];
    if (mapped) for (const p of mapped) prefixes.add(p);
  }
  return Array.from(prefixes);
}

// ─── Search Grants.gov ───
async function searchGrantsGov(alnPrefixes: string[]): Promise<any[]> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;

  // Search last 180 days
  const now = new Date();
  const start = new Date(now.getTime() - 180 * 86400000);

  const basePayload: any = {
    rows: PAGE_SIZE,
    oppStatuses: "forecasted|posted",
    sortBy: "openDate|desc",
    postedFrom: `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}/${start.getFullYear()}`,
    postedTo: `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`,
  };

  if (alnPrefixes.length > 0) {
    basePayload.aln = alnPrefixes[0];
  }

  let allResults: any[] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const payload = { ...basePayload, startRecordNum: page * PAGE_SIZE };
    const response = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) break;

    const data = await response.json();
    const hits = data?.oppHits || [];
    if (hits.length === 0) break;

    for (const opp of hits) {
      allResults.push({
        aln: opp.cfdaList || opp.cfda || "",
        title: opp.title || "",
        agency: opp.agency || "",
        postedDate: opp.openDate || "",
        closeDate: opp.closeDate || "",
      });
    }

    if (hits.length < PAGE_SIZE) break;
    page++;
  }

  return allResults;
}

// ─── Run full pipeline ───
const PIPELINE_TIMEOUT_MS = 150_000; // 2.5 minutes - leave buffer before edge function kills us
const MAX_PAGES_PER_ALN = 10; // Cap pages per ALN to avoid runaway fetches

async function runPipeline(
  serviceClient: any,
  runId: string,
  alns: string[],
  lookbackMonths: number,
  emailAddress: string,
  explicitStartDate?: string,
  explicitEndDate?: string
) {
  const pipelineStart = Date.now();

  try {
    let startStr: string;
    let endStr: string;

    if (explicitStartDate && explicitEndDate) {
      startStr = explicitStartDate;
      endStr = explicitEndDate;
    } else {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - lookbackMonths);
      startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
      endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    }

    let totalPrime = 0;
    let totalSub = 0;
    let processedAlns = 0;
    let timedOut = false;
    const csvRows: string[] = [
      "Type,ALN,Recipient,Amount,Agency,Start Date,End Date,Description",
    ];

    for (const aln of alns) {
      // Check timeout before each ALN
      if (Date.now() - pipelineStart > PIPELINE_TIMEOUT_MS) {
        console.warn(`Pipeline timeout after processing ${processedAlns}/${alns.length} ALNs`);
        timedOut = true;
        break;
      }

      // Fetch prime awards (with reduced page cap)
      const primeResults = await fetchUSASpendingAwards(aln, startStr, endStr, "prime", MAX_PAGES_PER_ALN);
      totalPrime += primeResults.length;

      for (const award of primeResults) {
        csvRows.push(
          `Prime,${aln},"${escapeCsv(award.recipientName)}",${award.amount},"${escapeCsv(award.agency)}",${award.startDate},${award.endDate},"${escapeCsv(award.description)}"`
        );
      }

      // Check timeout again before sub-awards
      if (Date.now() - pipelineStart > PIPELINE_TIMEOUT_MS) {
        console.warn(`Pipeline timeout after prime awards for ALN ${aln}`);
        timedOut = true;
        processedAlns++;
        break;
      }

      // Fetch sub-awards
      const subResults = await fetchUSASpendingAwards(aln, startStr, endStr, "sub", MAX_PAGES_PER_ALN);
      totalSub += subResults.length;

      for (const sub of subResults) {
        csvRows.push(
          `Sub-Award,${aln},"${escapeCsv(sub.recipientName)}",${sub.amount},"${escapeCsv(sub.agency || "")}",${sub.date || ""},${""},"${escapeCsv(sub.description)}"`
        );
      }

      processedAlns++;
    }

    const csvContent = csvRows.join("\n");

    // Upload CSV to storage
    let csvUrl: string | null = null;
    try {
      const fileName = `pipeline_${runId}_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      const arrayBuffer = await csvBlob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      const { error: uploadErr } = await serviceClient.storage
        .from("grant-monitor-csvs")
        .upload(fileName, uint8, { contentType: "text/csv", upsert: false });

      if (!uploadErr) {
        const { data: urlData } = serviceClient.storage
          .from("grant-monitor-csvs")
          .getPublicUrl(fileName);
        // Since bucket is private, generate a signed URL instead
        const { data: signedData } = await serviceClient.storage
          .from("grant-monitor-csvs")
          .createSignedUrl(fileName, 60 * 60 * 24 * 30); // 30 days
        csvUrl = signedData?.signedUrl || null;
      } else {
        console.error("CSV upload error:", uploadErr);
      }
    } catch (storageErr: any) {
      console.error("Storage error:", storageErr.message);
    }

    // Update run with results
    const finalStatus = timedOut ? "partial" : "completed";
    const errorMsg = timedOut ? `Processed ${processedAlns}/${alns.length} ALNs before timeout` : null;
    await serviceClient
      .from("grant_monitor_runs")
      .update({
        status: finalStatus,
        prime_awards_found: totalPrime,
        sub_awards_found: totalSub,
        completed_at: new Date().toISOString(),
        csv_url: csvUrl,
        error_message: errorMsg,
      })
      .eq("id", runId);

    // Send email if address provided
    if (emailAddress) {
      await sendEmailWithCSV(emailAddress, alns, totalPrime, totalSub, csvContent);
    }
  } catch (err: any) {
    console.error("Pipeline run error:", err);
    await serviceClient
      .from("grant_monitor_runs")
      .update({
        status: "failed",
        error_message: err.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}

function escapeCsv(str: string): string {
  return (str || "").replace(/"/g, '""');
}

// ─── Fetch from USAspending ───
async function fetchUSASpendingAwards(
  aln: string,
  startDate: string,
  endDate: string,
  type: "prime" | "sub",
  maxPages: number = 100
): Promise<any[]> {
  const PAGE_SIZE = 100;

  const filters = {
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: ["02", "03", "04", "05"],
    program_numbers: [aln],
    recipient_type_names: [
      "state_government", "county_government", "city_or_township_government",
      "special_district_government", "regional_organization",
      "us_territory_or_possession", "independent_school_district",
      "public_institution_of_higher_education", "indian_tribe_federally_recognized",
      "nonprofit_with_501c3", "nonprofit_without_501c3",
    ],
  };

  const allResults: any[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    // Both prime and sub use the same endpoint; subawards flag differentiates
    const endpoint = "https://api.usaspending.gov/api/v2/search/spending_by_award/";

    const primeFields = [
      "Award ID", "Recipient Name", "Award Amount",
      "Awarding Agency", "Awarding Sub Agency",
      "Start Date", "End Date", "Description",
    ];
    const subFields = [
      "Sub-Award ID", "Sub-Awardee Name", "Sub-Award Amount",
      "Awarding Agency", "Action Date", "Sub-Award Description",
      "Prime Recipient Name",
    ];

    const payload: any = {
      filters,
      fields: type === "prime" ? primeFields : subFields,
      page,
      limit: PAGE_SIZE,
      sort: type === "prime" ? "Award Amount" : "Sub-Award Amount",
      order: "desc",
      subawards: type === "sub",
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) break;

    const data = await response.json();
    const hits = data?.results || [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      if (type === "prime") {
        allResults.push({
          recipientName: hit["Recipient Name"] || "",
          amount: hit["Award Amount"] || 0,
          agency: hit["Awarding Agency"] || "",
          startDate: hit["Start Date"] || "",
          endDate: hit["End Date"] || "",
          description: hit["Description"] || "",
        });
      } else {
        allResults.push({
          recipientName: hit["Sub-Awardee Name"] || "",
          amount: hit["Sub-Award Amount"] || 0,
          date: hit["Action Date"] || "",
          description: hit["Sub-Award Description"] || "",
          agency: hit["Awarding Agency"] || "",
          primeRecipient: hit["Prime Recipient Name"] || "",
        });
      }
    }

    if (!data?.page_metadata?.hasNext) break;
    if (hits.length < PAGE_SIZE) break;
    page++;
  }

  return allResults;
}

// ─── Send email ───
async function sendEmailWithCSV(
  to: string,
  alns: string[],
  primeCount: number,
  subCount: number,
  csvContent: string
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not set, skipping email");
    return;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Grant Monitor Pipeline Report</h2>
      <p>Your automated grant monitoring pipeline has completed.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f0f0f0;">
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>ALN Numbers Processed</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alns.length}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Prime Awards Found</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${primeCount}</td>
        </tr>
        <tr style="background: #f0f0f0;">
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sub-Awards Found</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${subCount}</td>
        </tr>
      </table>
      <h3>ALNs Processed:</h3>
      <p>${alns.join(", ")}</p>
      <hr />
      <h3>CSV Data (attached below)</h3>
      <pre style="background: #f5f5f5; padding: 10px; font-size: 11px; overflow: auto; max-height: 400px;">${csvContent}</pre>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        This is an automated report from the Bonterra Grant Monitor.
      </p>
    </div>
  `;

  // Use Lovable AI gateway to send email via an edge function approach
  // For now, log the email content - actual email sending would need Resend or similar
  console.log(`Email would be sent to: ${to}`);
  console.log(`Subject: Grant Monitor Report - ${alns.length} ALNs, ${primeCount} Prime Awards, ${subCount} Sub-Awards`);
  console.log(`CSV rows: ${csvContent.split("\n").length}`);
}
