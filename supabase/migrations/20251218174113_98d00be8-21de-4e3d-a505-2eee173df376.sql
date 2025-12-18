-- Allow all authenticated users to read core dashboard data (fixes 0 results due to restrictive RLS)

-- organizations
CREATE POLICY "Authenticated users can view all organizations"
ON public.organizations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- funding_records
CREATE POLICY "Authenticated users can view all funding records"
ON public.funding_records
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- subawards
CREATE POLICY "Authenticated users can view all subawards"
ON public.subawards
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);

-- fetch_progress (so the UI can show progress to the user who triggered it)
CREATE POLICY "Authenticated users can view fetch progress"
ON public.fetch_progress
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (true);
