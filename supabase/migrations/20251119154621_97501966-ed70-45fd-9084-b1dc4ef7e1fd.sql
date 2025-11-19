-- Create subawards table to track sub-recipients
CREATE TABLE public.subawards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funding_record_id UUID NOT NULL REFERENCES public.funding_records(id) ON DELETE CASCADE,
  recipient_organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT,
  award_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subawards ENABLE ROW LEVEL SECURITY;

-- RLS policies for subawards
CREATE POLICY "Authenticated users can view all subawards"
ON public.subawards
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert subawards"
ON public.subawards
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update subawards"
ON public.subawards
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete subawards"
ON public.subawards
FOR DELETE
TO authenticated
USING (true);

-- Add index for better query performance
CREATE INDEX idx_subawards_funding_record ON public.subawards(funding_record_id);
CREATE INDEX idx_subawards_recipient ON public.subawards(recipient_organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_subawards_updated_at
BEFORE UPDATE ON public.subawards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();