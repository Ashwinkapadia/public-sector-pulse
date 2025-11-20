-- Add action_date column to funding_records to track when grants were awarded
ALTER TABLE funding_records 
ADD COLUMN IF NOT EXISTS action_date date;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_funding_records_action_date 
ON funding_records(action_date DESC);

COMMENT ON COLUMN funding_records.action_date IS 'Date when the grant was awarded/action taken (used for filtering recent grants)';