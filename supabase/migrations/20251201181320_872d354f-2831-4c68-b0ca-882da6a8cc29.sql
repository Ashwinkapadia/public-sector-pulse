-- Fix remaining security and functionality issues

-- 1. Allow reps to view subawards for organizations they're assigned to
CREATE POLICY "Reps can view subawards for assigned organizations"
ON public.subawards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.funding_records fr
    INNER JOIN public.rep_assignments ra ON ra.organization_id = fr.organization_id
    WHERE fr.id = subawards.funding_record_id
    AND ra.rep_id = auth.uid()
  )
);

-- 2. Add DELETE policy for profiles (users can delete their own, admins can delete any)
CREATE POLICY "Users can delete their own profile or admins can delete any"
ON public.profiles FOR DELETE
USING (
  auth.uid() = id 
  OR 
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- 3. Allow reps to delete their own assignments
CREATE POLICY "Reps can delete their own assignments"
ON public.rep_assignments FOR DELETE
USING (rep_id = auth.uid());

-- 4. Add admin policies for verticals table management
CREATE POLICY "Admins can insert verticals"
ON public.verticals FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update verticals"
ON public.verticals FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete verticals"
ON public.verticals FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));