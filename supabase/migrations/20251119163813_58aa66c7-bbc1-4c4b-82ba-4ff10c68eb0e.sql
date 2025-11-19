-- Create grant_types table for federal grants like MIECHV, Early Head Start
CREATE TABLE public.grant_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  federal_agency TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create program_models table for evidence-based models like NFP, HFA, PAT
CREATE TABLE public.program_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  model_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add grant_type_id to funding_records
ALTER TABLE public.funding_records 
ADD COLUMN grant_type_id UUID REFERENCES public.grant_types(id);

-- Create junction table for many-to-many relationship between funding records and program models
CREATE TABLE public.funding_record_program_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funding_record_id UUID NOT NULL REFERENCES public.funding_records(id) ON DELETE CASCADE,
  program_model_id UUID NOT NULL REFERENCES public.program_models(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(funding_record_id, program_model_id)
);

-- Enable RLS on new tables
ALTER TABLE public.grant_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_record_program_models ENABLE ROW LEVEL SECURITY;

-- RLS policies for grant_types
CREATE POLICY "Authenticated users can view all grant types"
ON public.grant_types FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert grant types"
ON public.grant_types FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update grant types"
ON public.grant_types FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete grant types"
ON public.grant_types FOR DELETE
USING (true);

-- RLS policies for program_models
CREATE POLICY "Authenticated users can view all program models"
ON public.program_models FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert program models"
ON public.program_models FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update program models"
ON public.program_models FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete program models"
ON public.program_models FOR DELETE
USING (true);

-- RLS policies for funding_record_program_models
CREATE POLICY "Authenticated users can view funding record program models"
ON public.funding_record_program_models FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert funding record program models"
ON public.funding_record_program_models FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update funding record program models"
ON public.funding_record_program_models FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete funding record program models"
ON public.funding_record_program_models FOR DELETE
USING (true);

-- Create indexes for better query performance
CREATE INDEX idx_funding_records_grant_type ON public.funding_records(grant_type_id);
CREATE INDEX idx_funding_record_program_models_funding ON public.funding_record_program_models(funding_record_id);
CREATE INDEX idx_funding_record_program_models_model ON public.funding_record_program_models(program_model_id);

-- Insert initial grant types
INSERT INTO public.grant_types (name, description, federal_agency) VALUES
  ('MIECHV', 'Maternal, Infant, and Early Childhood Home Visiting Program', 'Department of Health and Human Services'),
  ('Early Head Start - Home-Based', 'Early Head Start home-based program option', 'Department of Health and Human Services'),
  ('TANF', 'Temporary Assistance for Needy Families - can fund home visiting', 'Department of Health and Human Services'),
  ('CCDF', 'Child Care and Development Fund - can support home visiting', 'Department of Health and Human Services');

-- Insert initial program models
INSERT INTO public.program_models (name, description, model_type) VALUES
  ('Nurse-Family Partnership (NFP)', 'Nurse home visiting program for first-time, low-income mothers', 'Nurse-led'),
  ('Healthy Families America (HFA)', 'Strength-based home visiting program focused on child maltreatment prevention', 'Paraprofessional-led'),
  ('Parents as Teachers (PAT)', 'Parent education and family support program', 'Education-focused'),
  ('SafeCare', 'Home visiting program focused on child maltreatment prevention', 'Skills-based'),
  ('Early Head Start - Home-Based', 'Comprehensive child development program for infants and toddlers', 'Comprehensive');