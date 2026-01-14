-- Fix PUBLIC_DATA_EXPOSURE: Remove overly permissive policy from organizations table
DROP POLICY IF EXISTS "Authenticated users can view all organizations" ON public.organizations;