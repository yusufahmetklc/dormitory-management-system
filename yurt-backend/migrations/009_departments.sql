-- =========================================================
-- 009: Bölümler tablosu + student_profiles FK
-- Neon SQL Editor'da neondb_owner olarak çalıştırın.
-- =========================================================

-- Bölümler tablosu
CREATE TABLE IF NOT EXISTS public.departments (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    code         CHAR(3)      NOT NULL UNIQUE,   -- 3 haneli kod: '001', '002' ...
    program_type VARCHAR(20)  CHECK (program_type IN ('2-year', '4-year')) DEFAULT '4-year',
    faculty      VARCHAR(100),
    is_active    BOOLEAN      DEFAULT TRUE,
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Başlangıç bölümleri (çakışma varsa atla)
INSERT INTO public.departments (name, code, program_type, faculty) VALUES
  ('Bilgisayar Programcılığı', '001', '2-year', 'Meslek Yüksekokulu'),
  ('Bilgisayar Mühendisliği',  '002', '4-year', 'Mühendislik Fakültesi'),
  ('İşletme',                  '003', '4-year', 'İktisadi ve İdari Bilimler Fakültesi'),
  ('Elektrik-Elektronik Müh.', '004', '4-year', 'Mühendislik Fakültesi'),
  ('Matematik',                '005', '4-year', 'Fen-Edebiyat Fakültesi'),
  ('İnşaat Mühendisliği',      '006', '4-year', 'Mühendislik Fakültesi'),
  ('Makine Mühendisliği',      '007', '4-year', 'Mühendislik Fakültesi'),
  ('Ekonomi',                  '008', '4-year', 'İktisadi ve İdari Bilimler Fakültesi'),
  ('Hukuk',                    '009', '4-year', 'Hukuk Fakültesi'),
  ('Fizik',                    '010', '4-year', 'Fen-Edebiyat Fakültesi')
ON CONFLICT (code) DO NOTHING;

-- student_profiles tablosuna department_id FK ekliyoruz
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES public.departments(id);

-- belek05 rolüne departments tablosu için SELECT yetkisi
GRANT SELECT ON TABLE public.departments TO belek05;
