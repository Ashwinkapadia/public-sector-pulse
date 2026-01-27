import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClayPayload {
  dataType: "organizations" | "funding_records" | "subawards";
  records: Record<string, unknown>[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Clay webhook URL from secrets
    const clayWebhookUrl = Deno.env.get("CLAY_WEBHOOK_URL");
    
    if (!clayWebhookUrl) {
      return new Response(
        JSON.stringify({ error: "Clay webhook URL not configured. Please add CLAY_WEBHOOK_URL secret." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const payload: ClayPayload = await req.json();
    
    if (!payload.dataType || !payload.records || !Array.isArray(payload.records)) {
      return new Response(
        JSON.stringify({ error: "Invalid payload. Required: dataType, records" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (payload.records.length === 0) {
      return new Response(
        JSON.stringify({ error: "No records to export" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Pushing ${payload.records.length} ${payload.dataType} records to Clay`);

    // Push data to Clay webhook
    const clayResponse = await fetch(clayWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataType: payload.dataType,
        records: payload.records,
        exportedAt: new Date().toISOString(),
        recordCount: payload.records.length,
      }),
    });

    if (!clayResponse.ok) {
      const errorText = await clayResponse.text();
      console.error("Clay webhook error:", errorText);
      return new Response(
        JSON.stringify({ error: `Clay webhook failed: ${clayResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully pushed ${payload.records.length} records to Clay`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully exported ${payload.records.length} ${payload.dataType} records to Clay`,
        recordCount: payload.records.length 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in push-to-clay:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
