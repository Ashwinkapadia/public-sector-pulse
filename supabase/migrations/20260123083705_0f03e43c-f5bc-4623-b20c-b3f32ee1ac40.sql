-- Fix the admin_audit_log insert policy - it should not use WITH CHECK (true)
-- Instead, we'll rely on service role which bypasses RLS
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.admin_audit_log;