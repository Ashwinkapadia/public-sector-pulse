-- Fix INFO_LEAKAGE: Remove overly permissive fetch_progress policy
DROP POLICY IF EXISTS "Authenticated users can view fetch progress" ON public.fetch_progress;

-- Fix SUPA_rls_policy_always_true: Remove overly permissive policies on fetch_progress (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Service role can insert fetch progress" ON public.fetch_progress;
DROP POLICY IF EXISTS "Service role can update fetch progress" ON public.fetch_progress;
DROP POLICY IF EXISTS "Service role can delete fetch progress" ON public.fetch_progress;

-- Fix funding_records permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view all funding records" ON public.funding_records;

-- Fix subawards permissive SELECT policy  
DROP POLICY IF EXISTS "Authenticated users can view all subawards" ON public.subawards;

-- Add a user_id column to fetch_progress for proper user-scoped access
ALTER TABLE public.fetch_progress ADD COLUMN IF NOT EXISTS user_id uuid;

-- Create policy for users to view their own fetch progress
CREATE POLICY "Users can view their own fetch progress"
ON public.fetch_progress
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Create admin audit log table for tracking destructive operations
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Only service role can insert audit logs (via edge functions)
CREATE POLICY "Service role can insert audit logs"
ON public.admin_audit_log
FOR INSERT
WITH CHECK (true);