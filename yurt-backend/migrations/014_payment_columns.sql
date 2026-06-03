-- ============================================================
-- MİGRASYON 014: Ödeme Modülü Ek Sütunlar
-- ============================================================
-- Bu SQL'i Neon SQL Editor'da neondb_owner olarak çalıştırın:
--   1. https://console.neon.tech adresine gidin
--   2. Projenizi seçin → "SQL Editor" sekmesine tıklayın
--   3. Bu SQL'in TAMAMINI kopyalayıp yapıştırın
--   4. "Run" butonuna basın
-- ============================================================

-- Ödeme türü sütunu ekle (Tek seferlik / Taksitli / Aylık / Depozito / Ek ücret / Kısmi)
ALTER TABLE belek_dormitory_module.payments
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) DEFAULT 'Tek seferlik';

-- Kısmi ödeme tutarı sütunu ekle
ALTER TABLE belek_dormitory_module.payments
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) DEFAULT 0;

-- belek05 kullanıcısına bu tabloda tam yetki ver (SELECT/INSERT/UPDATE/DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE belek_dormitory_module.payments
  TO belek05;

-- Kontrol: Sütunlar eklendi mi?
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'belek_dormitory_module'
  AND table_name   = 'payments'
ORDER BY ordinal_position;
