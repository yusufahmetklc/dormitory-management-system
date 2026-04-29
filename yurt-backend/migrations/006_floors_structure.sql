-- ============================================================
-- 006: KAT YAPISI — BİNA → KAT → ODA HİYERARŞİSİ
-- ============================================================
-- Bu migration'ı Neon SQL Editor'da çalıştırın.
-- Mevcut veriler korunur — sadece yeni tablolar eklenir.
-- ============================================================


-- ╔══════════════════════════════════════════════════════╗
-- ║  ADIM 1: KATLAR TABLOSU                             ║
-- ╚══════════════════════════════════════════════════════╝

-- floors tablosunu oluştur (varsa atla)
CREATE TABLE IF NOT EXISTS floors (
    id           SERIAL PRIMARY KEY,
    building_id  INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(building_id, floor_number)
);

CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);


-- ╔══════════════════════════════════════════════════════╗
-- ║  ADIM 2: ROOMS TABLOSUNA floor_id EKLE             ║
-- ╚══════════════════════════════════════════════════════╝

-- floor_id sütunu yoksa ekle
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor_id INTEGER REFERENCES floors(id);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms(floor_id);


-- ╔══════════════════════════════════════════════════════╗
-- ║  ADIM 3: MEVCUT ODALARDAN KAT KAYITLARINI DOLDUR  ║
-- ╚══════════════════════════════════════════════════════╝

-- Mevcut odaların building_id + floor_number kombinasyonundan
-- floors tablosuna kayıt ekle (çakışma varsa atla)
INSERT INTO floors (building_id, floor_number)
SELECT DISTINCT building_id,
       COALESCE(floor, 1) AS floor_number
FROM rooms
WHERE is_active = TRUE
  AND building_id IS NOT NULL
ON CONFLICT (building_id, floor_number) DO NOTHING;


-- ╔══════════════════════════════════════════════════════╗
-- ║  ADIM 4: MEVCUT ODALARDA floor_id'yi GÜNCELLE      ║
-- ╚══════════════════════════════════════════════════════╝

-- Odaların floor_id'sini, aynı building + floor_number eşleşmesine göre doldur
UPDATE rooms r
SET floor_id = f.id
FROM floors f
WHERE f.building_id = r.building_id
  AND f.floor_number = COALESCE(r.floor, 1)
  AND r.floor_id IS NULL;


-- ╔══════════════════════════════════════════════════════╗
-- ║  KONTROL SORGUSU                                    ║
-- ╚══════════════════════════════════════════════════════╝

SELECT
  b.name AS bina,
  f.floor_number AS kat,
  COUNT(r.id) AS oda_sayisi
FROM buildings b
JOIN floors f ON f.building_id = b.id
LEFT JOIN rooms r ON r.floor_id = f.id AND r.is_active = TRUE
GROUP BY b.name, f.floor_number
ORDER BY b.name, f.floor_number;
