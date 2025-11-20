-- Add last_updated column to funding_records to track recent activity
ALTER TABLE funding_records 
ADD COLUMN IF NOT EXISTS last_updated timestamp with time zone DEFAULT now();

-- Add index for efficient querying of recent records
CREATE INDEX IF NOT EXISTS idx_funding_records_last_updated 
ON funding_records(last_updated DESC);

-- Clear all existing data (simulated subawards and funding records)
DELETE FROM subawards;
DELETE FROM funding_records;
DELETE FROM organizations;

-- Add comment for documentation
COMMENT ON COLUMN funding_records.last_updated IS 'Timestamp when this record was last seen/updated in the data source';