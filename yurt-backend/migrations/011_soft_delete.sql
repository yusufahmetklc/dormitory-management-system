-- 011_soft_delete.sql
-- Soft delete alanlari ekler: is_deleted, deleted_at, deleted_by
-- Mevcut tablolara zarar vermez (IF NOT EXISTS kullanilir)
--
-- SCHEMA HARITASI:
--   public.users                         -> kullanicilar
--   belek_dormitory_module.rooms         -> odalar
--   belek_dormitory_module.announcements -> duyurular
--   belek_dormitory_module.complaints    -> sikayetler
-- ============================================================

-- USERS (public semasi)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  INTEGER            DEFAULT NULL;

-- ROOMS (belek_dormitory_module semasi)
ALTER TABLE belek_dormitory_module.rooms
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  INTEGER            DEFAULT NULL;

-- ANNOUNCEMENTS (belek_dormitory_module semasi)
ALTER TABLE belek_dormitory_module.announcements
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  INTEGER            DEFAULT NULL;

-- COMPLAINTS (belek_dormitory_module semasi)
ALTER TABLE belek_dormitory_module.complaints
  ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by  INTEGER            DEFAULT NULL;

-- Indeksler (listeleme sorgularini hizlandirir)
CREATE INDEX IF NOT EXISTS idx_users_is_deleted
  ON public.users (is_deleted);

CREATE INDEX IF NOT EXISTS idx_rooms_is_deleted
  ON belek_dormitory_module.rooms (is_deleted);

CREATE INDEX IF NOT EXISTS idx_announcements_is_deleted
  ON belek_dormitory_module.announcements (is_deleted);

CREATE INDEX IF NOT EXISTS idx_complaints_is_deleted
  ON belek_dormitory_module.complaints (is_deleted);