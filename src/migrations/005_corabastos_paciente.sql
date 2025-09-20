-- UP MIGRATION
-- Update corabastos emergency requests to replace description with paciente_id

-- Add paciente_id column to store the user who will lead the emergency topic
ALTER TABLE corabastos_emergency_requests 
ADD COLUMN IF NOT EXISTS paciente_id VARCHAR(20) REFERENCES users(id);

-- Remove description column as we're replacing it with paciente
-- Note: In production, you might want to migrate data first
ALTER TABLE corabastos_emergency_requests 
DROP COLUMN IF EXISTS description;

-- DOWN MIGRATION
-- Restore the original schema
ALTER TABLE corabastos_emergency_requests 
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE corabastos_emergency_requests 
DROP COLUMN IF EXISTS paciente_id;
