-- Add DELETE policies for clearing data functionality

-- Allow authenticated users to delete funding records
CREATE POLICY "Authenticated users can delete funding records"
ON public.funding_records
FOR DELETE
TO authenticated
USING (true);

-- Allow authenticated users to delete organizations
CREATE POLICY "Authenticated users can delete organizations"
ON public.organizations
FOR DELETE
TO authenticated
USING (true);

-- Add INSERT policies if users need to create data via edge functions
CREATE POLICY "Authenticated users can insert funding records"
ON public.funding_records
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can insert organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);