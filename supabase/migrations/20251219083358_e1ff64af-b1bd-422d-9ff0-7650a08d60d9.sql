-- Add state column to saved_subaward_searches table
ALTER TABLE public.saved_subaward_searches
ADD COLUMN state text DEFAULT NULL;