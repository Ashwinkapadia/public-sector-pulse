
-- Fix funding_records SELECT: drop restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Admins and assigned reps can view funding records" ON public.funding_records;
CREATE POLICY "Admins and assigned reps can view funding records"
  ON public.funding_records
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM rep_assignments
      WHERE rep_assignments.organization_id = funding_records.organization_id
        AND rep_assignments.rep_id = auth.uid()
    )
  );

-- Fix organizations SELECT: drop restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Admins and assigned reps can view organizations" ON public.organizations;
CREATE POLICY "Admins and assigned reps can view organizations"
  ON public.organizations
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM rep_assignments
      WHERE rep_assignments.organization_id = organizations.id
        AND rep_assignments.rep_id = auth.uid()
    )
  );
