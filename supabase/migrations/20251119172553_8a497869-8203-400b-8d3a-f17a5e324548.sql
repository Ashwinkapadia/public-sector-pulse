-- Add unique constraint to organizations table for proper upsert behavior
ALTER TABLE organizations ADD CONSTRAINT organizations_name_state_key UNIQUE (name, state);