-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 013: ROOM CLEANING LOG TABLOSU
-- Neon Console > SQL Editor'de bu dosyayı çalıştırın
-- ═══════════════════════════════════════════════════════════════

-- Temizlik log tablosunu oluştur
CREATE TABLE IF NOT EXISTS belek_dormitory_module.room_cleaning_log (
  id          SERIAL PRIMARY KEY,
  room_id     INTEGER NOT NULL
                REFERENCES belek_dormitory_module.rooms(id)
                ON DELETE CASCADE,
  cleaned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleaned_by  INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  notes       TEXT
);

-- İndeksler (sorgu hızı için)
CREATE INDEX IF NOT EXISTS idx_rcl_room_id
  ON belek_dormitory_module.room_cleaning_log(room_id);

CREATE INDEX IF NOT EXISTS idx_rcl_cleaned_at
  ON belek_dormitory_module.room_cleaning_log(cleaned_at DESC);

-- belek05 kullanıcısına tam yetki ver
GRANT SELECT, INSERT, UPDATE, DELETE
  ON belek_dormitory_module.room_cleaning_log TO belek05;

GRANT USAGE, SELECT
  ON SEQUENCE belek_dormitory_module.room_cleaning_log_id_seq TO belek05;
