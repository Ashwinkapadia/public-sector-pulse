
CREATE TABLE public.grant_monitor_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  vertical_ids TEXT[] DEFAULT '{}',
  email_address TEXT NOT NULL,
  lookback_months INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.grant_monitor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedules"
ON public.grant_monitor_schedules FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own schedules"
ON public.grant_monitor_schedules FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own schedules"
ON public.grant_monitor_schedules FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own schedules"
ON public.grant_monitor_schedules FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.grant_monitor_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES public.grant_monitor_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  grants_found INTEGER DEFAULT 0,
  unique_alns TEXT[] DEFAULT '{}',
  prime_awards_found INTEGER DEFAULT 0,
  sub_awards_found INTEGER DEFAULT 0,
  csv_url TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.grant_monitor_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own runs"
ON public.grant_monitor_runs FOR SELECT
TO authenticated
USING (user_id = auth.uid());
