-- Enable realtime for fetch_progress table
ALTER TABLE public.fetch_progress REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fetch_progress;