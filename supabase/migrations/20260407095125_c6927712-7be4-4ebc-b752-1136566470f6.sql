INSERT INTO storage.buckets (id, name, public) VALUES ('grant-monitor-csvs', 'grant-monitor-csvs', false);

CREATE POLICY "Authenticated users can read grant monitor CSVs" ON storage.objects FOR SELECT USING (bucket_id = 'grant-monitor-csvs' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can upload grant monitor CSVs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'grant-monitor-csvs');