-- Add cfda_code column to grant_types table
ALTER TABLE public.grant_types
ADD COLUMN IF NOT EXISTS cfda_code TEXT,
ADD COLUMN IF NOT EXISTS grant_type TEXT;

-- Add cfda_code column to funding_records table for direct tracking
ALTER TABLE public.funding_records
ADD COLUMN IF NOT EXISTS cfda_code TEXT;

-- Create index for faster CFDA code lookups
CREATE INDEX IF NOT EXISTS idx_grant_types_cfda_code ON public.grant_types(cfda_code);
CREATE INDEX IF NOT EXISTS idx_funding_records_cfda_code ON public.funding_records(cfda_code);

-- Clear existing grant types to repopulate with complete data
TRUNCATE TABLE public.grant_types CASCADE;

-- Insert all grants from the verticals sheet with their CFDA codes
INSERT INTO public.grant_types (name, federal_agency, cfda_code, grant_type, description) VALUES
-- Aging Services
('OAA Title III-B (Supportive Services)', 'HHS', '93.044', 'Formula', 'Senior centers, transportation, case management.'),
('OAA Title III-C (Nutrition)', 'HHS', '93.045', 'Formula', 'Meals on Wheels, congregate dining.'),
('OAA Title III-E (Caregiver Support)', 'HHS', '93.052', 'Formula', 'Respite care, caregiver training.'),
('ADRC (Aging & Disability Resource Centers)', 'HHS', '93.048', 'Discretionary', 'No Wrong Door entry systems (Heavy software need).'),
('SCSEP (Senior Community Service Employment)', 'DOL', '17.235', 'Formula', 'Job training for low-income seniors.'),

-- CVI (Community Violence Intervention)
('CVIPI (Community Violence Intervention & Prevention)', 'DOJ', '16.045', 'Competitive', 'The flagship grant for CVI programs.'),
('VOCA (Victims of Crime Act)', 'DOJ', '16.575', 'Formula', 'Victim assistance, counseling, crisis intervention.'),
('Byrne JAG (Justice Assistance Grant)', 'DOJ', '16.738', 'Formula', 'Broad public safety, often diverted to CVI.'),
('Project AWARE', 'HHS', '93.243', 'Competitive', 'Violence prevention in schools/communities.'),

-- Higher Education
('TRIO Programs - Upward Bound', 'ED', '84.042', 'Competitive', 'Tutoring, counseling for first-gen students.'),
('TRIO Programs - Talent Search', 'ED', '84.044', 'Competitive', 'Tutoring, counseling for first-gen students.'),
('GEAR UP', 'ED', '84.334', 'Competitive', 'College readiness for low-income cohorts.'),
('Title III / Title V (HBCU / MSI / HSI)', 'ED', '84.031', 'Formula/Comp', 'Institutional capacity building (tech/infrastructure).'),

-- Home Visiting
('MIECHV (Maternal, Infant, Early Childhood Home Visiting)', 'HHS', '93.87', 'Formula', 'The Big One. Evidence-based home visits.'),
('Healthy Start Initiative', 'HHS', '93.926', 'Competitive', 'Reducing infant mortality in high-risk areas.'),
('Early Head Start (Home-Based Option)', 'HHS', '93.6', 'Competitive', 'Developmental support for 0-3 year olds.'),

-- K-12 Education
('Title I, Part A (Disadvantaged Students)', 'ED', '84.01', 'Formula', 'Supplemental support for low-income schools.'),
('IDEA, Part B (Special Education)', 'ED', '84.027', 'Formula', 'IEP management, special ed services.'),
('21st CCLC (Century Community Learning Centers)', 'ED', '84.287', 'Competitive', 'After-school and summer programs.'),
('Title IV, Part A (Student Support)', 'ED', '84.424', 'Block Grant', 'Well-rounded education (Safety, Tech, Mental Health).'),

-- Medicaid & HHS
('Medicaid 1115 Waivers', 'HHS', NULL, 'Waiver', 'State experiments (e.g., paying for housing/food).'),
('Money Follows the Person (MFP)', 'HHS', '93.791', 'Competitive', 'Moving people from nursing homes to community.'),
('Connecting Kids to Coverage', 'HHS', '93.767', 'Competitive', 'Outreach to enroll kids in Medicaid/CHIP.'),

-- Public Health
('PHEP (Public Health Emergency Preparedness)', 'HHS', '93.069', 'Cooperative Agmt', 'Bio-terrorism and outbreak response systems.'),
('PHHS (Preventive Health Block Grant)', 'HHS', '93.991', 'Block Grant', 'Flexible funding for state health needs.'),
('Title X Family Planning', 'HHS', '93.217', 'Competitive', 'Reproductive health services.'),

-- Public Safety
('COPS Hiring Program', 'DOJ', '16.71', 'Competitive', 'Hiring officers and community policing.'),
('STOP School Violence', 'DOJ', '16.839', 'Competitive', 'Threat assessment teams, reporting technology.'),
('UASI / SHSP (Homeland Security)', 'DHS', '97.067', 'Formula', 'Terrorism prevention (often funds fusion centers).'),

-- Re-entry
('Second Chance Act (Adult & Youth)', 'DOJ', '16.812', 'Competitive', 'Re-entry case management, substance abuse treatment.'),
('REO (Reentry Employment Opportunities)', 'DOL', '17.27', 'Competitive', 'Job training specifically for justice-involved.'),
('BJA JMHCP (Justice and Mental Health Collaboration)', 'DOJ', '16.745', 'Competitive', 'Diverting people with mental illness from jail.'),

-- Transportation
('Section 5310 (Seniors & Individuals w/ Disabilities)', 'DOT', '20.513', 'Formula', 'Vans, wheelchair lifts, mobility management software.'),
('Section 5307 (Urbanized Area Formula)', 'DOT', '20.507', 'Formula', 'General transit operations (bus/rail).'),
('RAISE Grants (formerly TIGER/BUILD)', 'DOT', '20.933', 'Competitive', 'Major infrastructure projects.'),

-- Veterans
('SSVF (Supportive Services for Veteran Families)', 'VA', '64.033', 'Competitive', 'Rapid re-housing and prevention (Huge for Case Mgmt).'),
('HVRP (Homeless Veterans Reintegration)', 'DOL', '17.805', 'Competitive', 'Job training for homeless vets.'),
('GPD (Grant and Per Diem)', 'VA', '64.024', 'Competitive', 'Transitional housing payment per bed/night.'),

-- Workforce Development
('WIOA Adult', 'DOL', '17.258', 'Formula', 'The core funding for Job Centers (AJCs).'),
('WIOA Dislocated Worker', 'DOL', '17.278', 'Formula', 'The core funding for Job Centers (AJCs).'),
('WIOA Youth', 'DOL', '17.259', 'Formula', 'Programs for out-of-school youth (16-24).'),
('Wagner-Peyser', 'DOL', '17.207', 'Formula', 'The Employment Service (matching people to jobs).'),
('H-1B Skills Training Grants', 'DOL', '17.268', 'Competitive', 'Training US workers to reduce reliance on H-1B visas.');