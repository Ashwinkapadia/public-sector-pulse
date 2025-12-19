-- Create table for saved sub-award searches
CREATE TABLE public.saved_subaward_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cfda_number TEXT,
  keywords TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.saved_subaward_searches ENABLE ROW LEVEL SECURITY;

-- Users can only view their own saved searches
CREATE POLICY "Users can view their own saved subaward searches"
ON public.saved_subaward_searches
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own saved searches
CREATE POLICY "Users can insert their own saved subaward searches"
ON public.saved_subaward_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own saved searches
CREATE POLICY "Users can update their own saved subaward searches"
ON public.saved_subaward_searches
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own saved searches
CREATE POLICY "Users can delete their own saved subaward searches"
ON public.saved_subaward_searches
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_saved_subaward_searches_updated_at
BEFORE UPDATE ON public.saved_subaward_searches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();