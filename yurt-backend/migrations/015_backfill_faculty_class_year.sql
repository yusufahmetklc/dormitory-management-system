-- =========================================================
-- 015: Mevcut öğrencilere faculty ve class_year backfill
-- Bölüm adını kullanarak fakülteyi eşleştirir,
-- class_year yoksa 1-6 arası rastgele değer atar.
-- =========================================================

-- 1) Bölüm adına göre fakülte ataması (student_profiles.department metin alanından)
UPDATE belek_dormitory_module.student_profiles sp
SET faculty = d.faculty
FROM public.departments d
WHERE (sp.faculty IS NULL OR sp.faculty = '')
  AND sp.department IS NOT NULL
  AND sp.department != ''
  AND LOWER(TRIM(sp.department)) = LOWER(TRIM(d.name));

-- 2) departments tablosunda birebir eşleşme bulunamayanlar için
--    ILIKE ile kısmi eşleştirme (örn. "Bilgisayar Müh." → "Bilgisayar Mühendisliği")
UPDATE belek_dormitory_module.student_profiles sp
SET faculty = d.faculty
FROM public.departments d
WHERE (sp.faculty IS NULL OR sp.faculty = '')
  AND sp.department IS NOT NULL
  AND sp.department != ''
  AND LOWER(TRIM(sp.department)) LIKE '%' || LOWER(TRIM(SPLIT_PART(d.name, ' ', 1))) || '%';

-- 3) department_id FK'si dolu olanlar için departments.faculty'den al
UPDATE belek_dormitory_module.student_profiles sp
SET faculty = d.faculty
FROM public.departments d
WHERE (sp.faculty IS NULL OR sp.faculty = '')
  AND sp.department_id = d.id;

-- 4) Hâlâ fakülte atanamayanlara: users.department alanını kullanarak tekrar dene
UPDATE belek_dormitory_module.student_profiles sp
SET    faculty = d.faculty
FROM   public.users u
JOIN   public.departments d
       ON LOWER(TRIM(u.department)) = LOWER(TRIM(d.name))
WHERE  (sp.faculty IS NULL OR sp.faculty = '')
  AND  sp.user_id = u.id;

-- 5) Kısmi eşleştirme ile users.department üzerinden
UPDATE belek_dormitory_module.student_profiles sp
SET    faculty = d.faculty
FROM   public.users u
JOIN   public.departments d
       ON LOWER(TRIM(u.department)) LIKE '%' || LOWER(TRIM(SPLIT_PART(d.name, ' ', 1))) || '%'
WHERE  (sp.faculty IS NULL OR sp.faculty = '')
  AND  sp.user_id = u.id;

-- 6) class_year boş olanlar için 1-6 arası rastgele değer ata
UPDATE belek_dormitory_module.student_profiles
SET class_year = FLOOR(RANDOM() * 6 + 1)::INTEGER
WHERE class_year IS NULL;

-- Sonucu raporla
SELECT
  COUNT(*)                                      AS toplam_profil,
  COUNT(faculty)                                AS faculty_dolu,
  COUNT(*) FILTER (WHERE faculty IS NULL)       AS faculty_bos,
  COUNT(class_year)                             AS class_year_dolu,
  COUNT(*) FILTER (WHERE class_year IS NULL)    AS class_year_bos
FROM belek_dormitory_module.student_profiles;
