-- Migration 007: Add gender column to users table
-- Run this in Neon SQL Editor as neondb_owner (belek05 lacks ALTER TABLE permission)
--
-- Possible values: 'male' | 'female' | NULL (unknown / not set)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10)
    CHECK (gender IN ('male', 'female'));

-- After adding the column, update existing students via the admin panel
-- or with direct SQL:
-- UPDATE public.users SET gender = 'female' WHERE id IN (...);
-- UPDATE public.users SET gender = 'male'   WHERE id IN (...);
