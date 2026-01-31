import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create auth client to validate user
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate the token using getClaims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Token validation failed:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    // Verify admin role using the auth client (respects RLS)
    const { data: roleData, error: roleError } = await authClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Internal error', message: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleData) {
      console.warn(`User ${userId} attempted bulk delete without admin role`);
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'Admin privileges required for this operation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for operations that bypass RLS
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Create audit log entry
    const { error: auditError } = await serviceClient
      .from('admin_audit_log')
      .insert({
        user_id: userId,
        action: 'BULK_DELETE_ALL_DATA',
        details: {
          timestamp: new Date().toISOString(),
          ip: req.headers.get('x-forwarded-for') || 'unknown'
        }
      });

    if (auditError) {
      console.error('Failed to create audit log:', auditError);
      // Continue with deletion even if audit fails - log the issue
    }

    // Perform deletions in order (respecting foreign key constraints)
    // 1. Delete subawards first
    const { error: subawardsError, count: subawardsCount } = await serviceClient
      .from('subawards')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (subawardsError) {
      console.error('Failed to delete subawards:', subawardsError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete subawards', details: subawardsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Delete funding records
    const { error: fundingError, count: fundingCount } = await serviceClient
      .from('funding_records')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (fundingError) {
      console.error('Failed to delete funding records:', fundingError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete funding records', details: fundingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Delete rep assignments (depends on organizations)
    const { error: assignmentsError, count: assignmentsCount } = await serviceClient
      .from('rep_assignments')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (assignmentsError) {
      console.error('Failed to delete rep assignments:', assignmentsError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete rep assignments', details: assignmentsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Delete organizations
    const { error: orgError, count: orgCount } = await serviceClient
      .from('organizations')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (orgError) {
      console.error('Failed to delete organizations:', orgError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete organizations', details: orgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Delete fetch progress rows (operational/logging data)
    const { error: progressError, count: progressCount } = await serviceClient
      .from('fetch_progress')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (progressError) {
      console.error('Failed to delete fetch progress:', progressError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete fetch progress', details: progressError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Delete saved searches
    const { error: savedSearchesError, count: savedSearchesCount } = await serviceClient
      .from('saved_searches')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (savedSearchesError) {
      console.error('Failed to delete saved searches:', savedSearchesError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete saved searches', details: savedSearchesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Delete saved subaward searches
    const { error: savedSubawardSearchesError, count: savedSubawardSearchesCount } = await serviceClient
      .from('saved_subaward_searches')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (savedSubawardSearchesError) {
      console.error('Failed to delete saved subaward searches:', savedSubawardSearchesError);
      return new Response(
        JSON.stringify({ error: 'Deletion failed', message: 'Failed to delete saved subaward searches', details: savedSubawardSearchesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(
      `Bulk delete completed by user ${userId}: ` +
      `${subawardsCount} subawards, ` +
      `${fundingCount} funding records, ` +
      `${assignmentsCount} rep assignments, ` +
      `${orgCount} organizations, ` +
      `${progressCount} fetch progress rows, ` +
      `${savedSearchesCount} saved searches, ` +
      `${savedSubawardSearchesCount} saved subaward searches`
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: {
          subawards: subawardsCount || 0,
          funding_records: fundingCount || 0,
          rep_assignments: assignmentsCount || 0,
          organizations: orgCount || 0,
          fetch_progress: progressCount || 0,
          saved_searches: savedSearchesCount || 0,
          saved_subaward_searches: savedSubawardSearchesCount || 0
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in admin-clear-data:', error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});