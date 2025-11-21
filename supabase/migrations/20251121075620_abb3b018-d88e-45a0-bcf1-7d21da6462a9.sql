-- Create a table to track fetch progress
CREATE TABLE IF NOT EXISTS public.fetch_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_pages INTEGER DEFAULT 0,
  current_page INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  errors TEXT[],
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.fetch_progress ENABLE ROW LEVEL SECURITY;

-- Create policies for fetch_progress
CREATE POLICY "Users can view all fetch progress" 
ON public.fetch_progress 
FOR SELECT 
USING (true);

CREATE POLICY "Service role can insert fetch progress" 
ON public.fetch_progress 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update fetch progress" 
ON public.fetch_progress 
FOR UPDATE 
USING (true);

CREATE POLICY "Service role can delete fetch progress" 
ON public.fetch_progress 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_fetch_progress_updated_at
BEFORE UPDATE ON public.fetch_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();