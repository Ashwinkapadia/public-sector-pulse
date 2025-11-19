-- Add missing verticals that are referenced in the code
INSERT INTO verticals (name, description) 
VALUES 
  ('Education', 'Educational programs and services (general)'),
  ('Transportation & Infrastructure', 'Transportation projects, roads, bridges, and infrastructure development'),
  ('Energy & Environment', 'Energy efficiency, renewable energy, environmental protection, and climate programs'),
  ('Healthcare', 'Healthcare programs, facilities, and services')
ON CONFLICT (name) DO NOTHING;