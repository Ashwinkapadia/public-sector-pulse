
SELECT cron.unschedule(1);

SELECT cron.schedule(
  'grant-monitor-hourly-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://dfobnipqgkjivupcufgv.supabase.co/functions/v1/grant-monitor-pipeline',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2JuaXBxZ2tqaXZ1cGN1Zmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDE5MzgsImV4cCI6MjA3OTExNzkzOH0.6FkUQ4KnW6t_nUvGZCFScH78PEepziBxI1DZ-jcZ1OY"}'::jsonb,
    body:='{"action": "run_scheduled"}'::jsonb
  ) AS request_id;
  $$
);
