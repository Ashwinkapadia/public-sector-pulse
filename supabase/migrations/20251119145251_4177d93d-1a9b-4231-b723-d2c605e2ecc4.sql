-- Add source column to funding_records table
ALTER TABLE funding_records 
ADD COLUMN source TEXT NOT NULL DEFAULT 'USAspending';

-- Create saved_searches table for storing user searches
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  state TEXT,
  start_date DATE,
  end_date DATE,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on saved_searches
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved searches
CREATE POLICY "Users can view their own saved searches"
ON saved_searches
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own saved searches
CREATE POLICY "Users can insert their own saved searches"
ON saved_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own saved searches
CREATE POLICY "Users can update their own saved searches"
ON saved_searches
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own saved searches
CREATE POLICY "Users can delete their own saved searches"
ON saved_searches
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_saved_searches_updated_at
BEFORE UPDATE ON saved_searches
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();