-- Remove duplicate permissive policies that override restrictive ones
-- PostgreSQL uses OR logic for multiple policies, so any permissive policy undermines security

-- 1. Fix grant_types - remove permissive policies, keep admin-only policies
DROP POLICY IF EXISTS "Authenticated users can delete grant types" ON public.grant_types;
DROP POLICY IF EXISTS "Authenticated users can insert grant types" ON public.grant_types;
DROP POLICY IF EXISTS "Authenticated users can update grant types" ON public.grant_types;

-- 2. Fix organizations - remove permissive policies, keep role-based policies
DROP POLICY IF EXISTS "Authenticated users can delete organizations" ON public.organizations;
DROP POLICY IF EXISTS "Authenticated users can insert organizations" ON public.organizations;

-- 3. Fix funding_records - remove permissive policies, keep admin-only policies
DROP POLICY IF EXISTS "Authenticated users can delete funding records" ON public.funding_records;
DROP POLICY IF EXISTS "Authenticated users can insert funding records" ON public.funding_records;

-- 4. Fix subawards - remove permissive policies, keep admin-only policies
DROP POLICY IF EXISTS "Authenticated users can delete subawards" ON public.subawards;
DROP POLICY IF EXISTS "Authenticated users can insert subawards" ON public.subawards;
DROP POLICY IF EXISTS "Authenticated users can update subawards" ON public.subawards;