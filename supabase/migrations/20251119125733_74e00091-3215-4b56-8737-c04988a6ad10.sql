-- Create verticals table for funding categories
CREATE TABLE public.verticals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  last_updated DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create funding_records table
CREATE TABLE public.funding_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vertical_id UUID NOT NULL REFERENCES public.verticals(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  fiscal_year INTEGER NOT NULL,
  date_range_start DATE,
  date_range_end DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_records ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users to read all data
CREATE POLICY "Authenticated users can view all verticals"
  ON public.verticals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all funding records"
  ON public.funding_records FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_organizations_state ON public.organizations(state);
CREATE INDEX idx_funding_records_organization ON public.funding_records(organization_id);
CREATE INDEX idx_funding_records_vertical ON public.funding_records(vertical_id);
CREATE INDEX idx_funding_records_fiscal_year ON public.funding_records(fiscal_year);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_funding_records_updated_at
  BEFORE UPDATE ON public.funding_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial verticals data
INSERT INTO public.verticals (name, description) VALUES
  ('Workforce Development', 'State and federal workforce programs including UI, WIOA, and childcare block grants'),
  ('Aging Services', 'Programs for elderly care and support services'),
  ('Veterans', 'State veterans services, homes, and support networks'),
  ('CVI Prevention', 'Community violence intervention and prevention programs'),
  ('Home Visiting', 'Maternal and child home visiting programs including MIECHV'),
  ('Re-entry', 'Prison re-entry and recidivism prevention programs');