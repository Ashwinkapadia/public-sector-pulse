-- Fix critical security issues by restricting RLS policies

-- 1. Fix profiles table - remove overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Profiles should only be viewable by the user themselves and admins
CREATE POLICY "Users can view their own profile or admins can view all"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id 
  OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Fix organizations table - restrict to admins and assigned reps only
DROP POLICY IF EXISTS "Authenticated users can view all organizations" ON public.organizations;

CREATE POLICY "Admins and assigned reps can view organizations"
ON public.organizations FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1 FROM public.rep_assignments
    WHERE rep_assignments.organization_id = organizations.id
    AND rep_assignments.rep_id = auth.uid()
  )
);

-- 3. Fix funding_records table - restrict to admins and reps of assigned organizations
DROP POLICY IF EXISTS "Authenticated users can view all funding records" ON public.funding_records;

CREATE POLICY "Admins and assigned reps can view funding records"
ON public.funding_records FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  EXISTS (
    SELECT 1 FROM public.rep_assignments
    WHERE rep_assignments.organization_id = funding_records.organization_id
    AND rep_assignments.rep_id = auth.uid()
  )
);

-- 4. Fix subawards table - restrict to admins only (as per existing INSERT/UPDATE/DELETE policies)
DROP POLICY IF EXISTS "Authenticated users can view all subawards" ON public.subawards;

CREATE POLICY "Admins can view all subawards"
ON public.subawards FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix rep_assignments table - restrict to admins and the assigned rep
DROP POLICY IF EXISTS "Authenticated users can view all assignments" ON public.rep_assignments;

CREATE POLICY "Admins and assigned reps can view assignments"
ON public.rep_assignments FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  rep_id = auth.uid()
);

-- 6. Fix fetch_progress table - remove overly permissive policy (admin policy already exists)
DROP POLICY IF EXISTS "Users can view all fetch progress" ON public.fetch_progress;