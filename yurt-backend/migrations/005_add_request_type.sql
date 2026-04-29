-- 005: Add type column to complaints table for unified request system
-- Types: complaint, maintenance, room_change, leave

ALTER TABLE belek_dormitory_module.complaints
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'complaint'
    CHECK (type IN ('complaint', 'maintenance', 'room_change', 'leave'));

CREATE INDEX IF NOT EXISTS idx_complaints_type ON belek_dormitory_module.complaints(type);

-- Also handle schema-less version
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'complaint'
    CHECK (type IN ('complaint', 'maintenance', 'room_change', 'leave'));
