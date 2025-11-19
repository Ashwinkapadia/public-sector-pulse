-- Drop the junction table first due to foreign key constraints
DROP TABLE IF EXISTS public.funding_record_program_models CASCADE;

-- Drop the program models table
DROP TABLE IF EXISTS public.program_models CASCADE;