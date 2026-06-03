-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 012: TEMIZLIK TÜRETİ YÖNETİMİ TABLOSU                         ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  Bu migration temizlik personelinin oda-oda temizlik listesi tablosunu   ║
-- ║  oluşturur. Her oda için temizlik durumu, son temizlik tarihi, notlar    ║
-- ║  vb. bilgiler tutulur.                                                   ║
-- ║                                                                            ║
-- ║  TABLO: cleaning_tasks                                                   ║
-- ║  ─────────────────────────────────────────────────────────────────────── ║
-- ║  id                 : Benzersiz tanımlayıcı (Primary Key)               ║
-- ║  room_number        : Oda numarası (örn: 101, 202, 305)                ║
-- ║  floor              : Kat numarası (1, 2, 3, vb.)                      ║
-- ║  capacity           : Oda kapasitesi (kaç kişi)                        ║
-- ║  is_cleaned         : Temizlenme durumu (true/false)                   ║
-- ║  notes              : Temizlik notları (ek bilgi)                      ║
-- ║  last_cleaned_by    : Kim tarafından temizlenmiş (user_id)             ║
-- ║  last_cleaned_at    : Son temizlik tarihi                              ║
-- ║  created_at         : Kayıt oluşturulma tarihi                         ║
-- ║  updated_at         : Son güncelleme tarihi                            ║
-- ║                                                                            ║
-- ║  KULLANIM:                                                                ║
-- ║  • Temizlik personeli: Oda temizlik listesini görebilir                 ║
-- ║  • Temizlik personeli: Her odanın temizlik durumunu güncelleyebilir     ║
-- ║  • Yönetici: Tüm temizlik kayıtlarını görebilir                        ║
-- ║  • Sistem: Temizlik istatistikleri hesaplamak için kullanır            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TEMIZLIK TÜRETİ TABLOSU OLUŞTUR
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id SERIAL PRIMARY KEY,
  
  -- ODA BİLGİLERİ
  room_number VARCHAR(10) NOT NULL,                  -- Örn: "101", "A202"
  floor INT DEFAULT 1,                              -- Kat numarası
  capacity INT DEFAULT 2,                           -- Oda kapasitesi
  
  -- TEMİZLİK DURUMU
  is_cleaned BOOLEAN DEFAULT FALSE,                 -- Temizlenmiş mi?
  notes TEXT,                                       -- Ek notlar/açıklamalar
  last_cleaned_by INT REFERENCES users(id),        -- Temizleyen kişi
  last_cleaned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- ZAMAN BİLGİLERİ
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- KISITLAMALAR
  UNIQUE(room_number),                             -- Her oda bir kez kaydedilir
  CONSTRAINT valid_floor CHECK (floor >= 0),      -- Kat negatif olamaz
  CONSTRAINT valid_capacity CHECK (capacity > 0)  -- Kapasite pozitif olmalı
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. İNDEKSLER - Sorgu performansı için
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_cleaning_tasks_is_cleaned 
  ON cleaning_tasks(is_cleaned);                   -- Temizlenmiş odalara hızlı erişim

CREATE INDEX idx_cleaning_tasks_floor 
  ON cleaning_tasks(floor);                        -- Kata göre sıralama için

CREATE INDEX idx_cleaning_tasks_last_cleaned 
  ON cleaning_tasks(last_cleaned_at DESC);        -- En son temizlenen odalar

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. BAŞLANGIÇ VERİLERİ - Test Odaları
-- ═══════════════════════════════════════════════════════════════════════════
-- Örnek: 3 kat, her katta 5 oda (Toplam 15 oda)
INSERT INTO cleaning_tasks (room_number, floor, capacity, is_cleaned) VALUES
  ('101', 1, 2, false),
  ('102', 1, 2, false),
  ('103', 1, 2, false),
  ('104', 1, 2, false),
  ('105', 1, 2, false),
  ('201', 2, 2, false),
  ('202', 2, 2, false),
  ('203', 2, 2, false),
  ('204', 2, 2, false),
  ('205', 2, 2, false),
  ('301', 3, 2, false),
  ('302', 3, 2, false),
  ('303', 3, 2, false),
  ('304', 3, 2, false),
  ('305', 3, 2, false)
ON CONFLICT DO NOTHING;                           -- Zaten varsa atla

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VİEW - İstatistik Hesaplaması
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW cleaning_summary AS
SELECT
  COUNT(*) as total_rooms,
  SUM(CASE WHEN is_cleaned = true THEN 1 ELSE 0 END) as cleaned_count,
  SUM(CASE WHEN is_cleaned = false THEN 1 ELSE 0 END) as pending_count,
  ROUND(
    (SUM(CASE WHEN is_cleaned = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
  ) as completed_percentage
FROM cleaning_tasks;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TRIGGER - updated_at Otomatik Güncelleme
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_cleaning_tasks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleaning_tasks_updated_at ON cleaning_tasks;

CREATE TRIGGER trigger_cleaning_tasks_updated_at
BEFORE UPDATE ON cleaning_tasks
FOR EACH ROW
EXECUTE FUNCTION update_cleaning_tasks_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════════════════
-- ÇALIŞTIRILMA:
-- psql -U yurt_admin -d yurt_db -f migrations/012_cleaning_tasks.sql
-- ═════════════════════════════════════════════════════════════════════════════
