-- ============================================================
-- YURT YÖNETİM SİSTEMİ — ÖĞRENCİ MODÜLÜ VERİTABANI ŞEMASI
-- PostgreSQL (Neon) için hazırlanmıştır
-- Bu dosyayı veritabanı admin hesabıyla çalıştırın (Neon SQL Editor)
-- ============================================================

-- ╔══════════════════════════════════════════════════════╗
-- ║  1. BİNALAR (buildings)                              ║
-- ║  Yurt binalarının temel bilgilerini tutar            ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS buildings (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,              -- Bina adı (A Blok, B Blok vb.)
    address         TEXT,                                -- Bina adresi
    total_floors    INTEGER NOT NULL DEFAULT 1,          -- Toplam kat sayısı
    gender_type     VARCHAR(10) CHECK (gender_type IN ('Erkek', 'Kız', 'Karma')) DEFAULT 'Karma',
    capacity        INTEGER NOT NULL DEFAULT 0,          -- Toplam yatak kapasitesi
    is_active       BOOLEAN DEFAULT TRUE,                -- Bina aktif mi?
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE buildings IS 'Yurt binaları — her bina birden fazla kata ve odaya sahip olabilir';

-- ╔══════════════════════════════════════════════════════╗
-- ║  2. ODALAR (rooms)                                   ║
-- ║  Her binadaki odaların bilgilerini tutar             ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS rooms (
    id              SERIAL PRIMARY KEY,
    building_id     INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number    INTEGER NOT NULL DEFAULT 1,          -- Kat numarası
    room_number     VARCHAR(20) NOT NULL,                -- Oda numarası (101, 102, A-201 vb.)
    capacity        INTEGER NOT NULL DEFAULT 2,          -- Oda kapasitesi (kaç kişilik)
    current_occupancy INTEGER NOT NULL DEFAULT 0,        -- Mevcut doluluk
    room_type       VARCHAR(20) CHECK (room_type IN ('Tek', 'Çift', 'Üçlü', 'Dörtlü')) DEFAULT 'Çift',
    has_bathroom    BOOLEAN DEFAULT FALSE,               -- Banyosu var mı?
    has_balcony     BOOLEAN DEFAULT FALSE,               -- Balkonu var mı?
    has_ac          BOOLEAN DEFAULT FALSE,               -- Kliması var mı?
    price_per_month NUMERIC(10,2) DEFAULT 0,             -- Aylık ücret (TL)
    status          VARCHAR(20) CHECK (status IN ('Boş', 'Dolu', 'Kısmi', 'Bakımda', 'Kapalı')) DEFAULT 'Boş',
    notes           TEXT,                                -- Ek notlar
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(building_id, room_number)                     -- Aynı binadaki oda numarası benzersiz
);

COMMENT ON TABLE rooms IS 'Yurt odaları — kapasite, doluluk, donanım ve fiyat bilgisi';

-- Oda arama performansı için index
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- ╔══════════════════════════════════════════════════════╗
-- ║  3. ÖĞRENCİ PROFİLLERİ (student_profiles)           ║
-- ║  Öğrencilere özel detaylı kimlik/iletişim bilgileri  ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS student_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_number          VARCHAR(20) UNIQUE,           -- Öğrenci numarası
    tc_no                   VARCHAR(11) UNIQUE,            -- TC Kimlik No
    birth_date              DATE,                          -- Doğum tarihi
    gender                  VARCHAR(10) CHECK (gender IN ('Erkek', 'Kadın', 'Diğer')),
    phone                   VARCHAR(20),                   -- Cep telefonu
    faculty                 VARCHAR(100),                  -- Fakülte
    department              VARCHAR(100),                  -- Bölüm
    enrollment_year         INTEGER,                       -- Kayıt yılı
    class_year              INTEGER CHECK (class_year BETWEEN 1 AND 6), -- Sınıf (1-6)
    blood_type              VARCHAR(5) CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','0+','0-')),
    chronic_diseases        TEXT,                           -- Kronik hastalıklar
    allergies               TEXT,                           -- Alerjiler
    address_city            VARCHAR(50),                    -- İl
    address_district        VARCHAR(50),                    -- İlçe
    address_full            TEXT,                           -- Tam adres
    guardian_name           VARCHAR(100),                   -- Veli adı
    guardian_phone          VARCHAR(20),                    -- Veli telefon
    guardian_relation       VARCHAR(30),                    -- Veli yakınlık (Anne, Baba, vb.)
    emergency_contact_name  VARCHAR(100),                   -- Acil durum kişisi
    emergency_contact_phone VARCHAR(20),                    -- Acil durum telefon
    profile_photo_url       VARCHAR(255),                   -- Profil fotoğrafı URL
    notes                   TEXT,                           -- Yönetici notları
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE student_profiles IS 'Öğrencilere özel kimlik, iletişim, sağlık ve veli bilgileri';

CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_number ON student_profiles(student_number);

-- ╔══════════════════════════════════════════════════════╗
-- ║  4. ODA ATAMALARI (room_assignments)                 ║
-- ║  Hangi öğrenci hangi odada kalıyor                   ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS room_assignments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    check_in_date   DATE NOT NULL DEFAULT CURRENT_DATE,  -- Giriş tarihi
    check_out_date  DATE,                                 -- Çıkış tarihi (NULL = hâlâ kalıyor)
    status          VARCHAR(20) CHECK (status IN ('Aktif', 'Çıkış', 'Transfer', 'İptal')) DEFAULT 'Aktif',
    assigned_by     INTEGER REFERENCES users(id),         -- Atamayı yapan yönetici
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE room_assignments IS 'Öğrenci-oda eşleştirmeleri ve konaklama geçmişi';

CREATE INDEX IF NOT EXISTS idx_assignments_user ON room_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_room ON room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON room_assignments(status);

-- ╔══════════════════════════════════════════════════════╗
-- ║  5. GİRİŞ-ÇIKIŞ KAYITLARI (entry_exit_logs)        ║
-- ║  Yurda giriş ve çıkış kayıtları                     ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS entry_exit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_type        VARCHAR(10) NOT NULL CHECK (log_type IN ('Giriş', 'Çıkış')),
    logged_at       TIMESTAMPTZ DEFAULT NOW(),            -- Kayıt zamanı
    logged_by       INTEGER REFERENCES users(id),         -- Kaydı giren güvenlik görevlisi
    gate            VARCHAR(50),                          -- Hangi kapıdan (Ana Giriş, Yan Kapı vb.)
    notes           TEXT,                                 -- Güvenlik notu
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE entry_exit_logs IS 'Öğrencilerin yurda giriş-çıkış kayıtları (güvenlik tarafından)';

CREATE INDEX IF NOT EXISTS idx_entry_exit_user ON entry_exit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_exit_type ON entry_exit_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_entry_exit_date ON entry_exit_logs(logged_at);

-- ╔══════════════════════════════════════════════════════╗
-- ║  6. ŞİKAYET & ARIZA BİLDİRİMLERİ (complaints)      ║
-- ║  Öğrencilerin arıza ve şikayetleri                  ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS complaints (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id         INTEGER REFERENCES rooms(id),         -- İlgili oda (nullable, genel şikayetler için)
    category        VARCHAR(30) NOT NULL CHECK (category IN ('Arıza', 'Şikayet', 'Öneri', 'Temizlik', 'Güvenlik', 'Diğer')),
    title           VARCHAR(200) NOT NULL,                -- Başlık
    description     TEXT NOT NULL,                        -- Detaylı açıklama
    priority        VARCHAR(10) CHECK (priority IN ('Düşük', 'Orta', 'Yüksek', 'Acil')) DEFAULT 'Orta',
    status          VARCHAR(20) CHECK (status IN ('Beklemede', 'İnceleniyor', 'Çözüldü', 'Reddedildi')) DEFAULT 'Beklemede',
    assigned_to     INTEGER REFERENCES users(id),         -- Atanan personel (Bakım, Temizlik vb.)
    response        TEXT,                                 -- Yönetici/personel yanıtı
    resolved_at     TIMESTAMPTZ,                          -- Çözülme tarihi
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE complaints IS 'Arıza bildirimleri, şikayetler, öneriler ve diğer talepler';

CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_assigned ON complaints(assigned_to);

-- ╔══════════════════════════════════════════════════════╗
-- ║  7. DUYURULAR (announcements)                        ║
-- ║  Yönetim tarafından yayınlanan duyurular             ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS announcements (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    category        VARCHAR(30) CHECK (category IN ('Genel', 'Acil', 'Bakım', 'Etkinlik', 'Kural')) DEFAULT 'Genel',
    created_by      INTEGER REFERENCES users(id),         -- Duyuruyu oluşturan yönetici
    target_role     VARCHAR(30),                          -- Hedef kitle (NULL = herkes, 'Öğrenci', 'Güvenlik' vb.)
    is_pinned       BOOLEAN DEFAULT FALSE,                -- Sabitlenmiş duyuru
    is_active       BOOLEAN DEFAULT TRUE,
    expires_at      TIMESTAMPTZ,                          -- Son geçerlilik tarihi
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE announcements IS 'Yönetim duyuruları — rolle filtrelenebilir, son kullanma tarihli';

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, expires_at);

-- ╔══════════════════════════════════════════════════════╗
-- ║  8. BAKIM KAYITLARI (maintenance_logs)               ║
-- ║  Bakım/onarım işlemlerinin kaydı                     ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER REFERENCES rooms(id),         -- İlgili oda
    complaint_id    INTEGER REFERENCES complaints(id),    -- İlgili şikayet (varsa)
    description     TEXT NOT NULL,                        -- Yapılan iş açıklaması
    performed_by    INTEGER REFERENCES users(id),         -- İşi yapan personel
    maintenance_type VARCHAR(30) CHECK (maintenance_type IN ('Elektrik', 'Tesisat', 'Mobilya', 'Boya', 'Temizlik', 'Klima', 'Diğer')) DEFAULT 'Diğer',
    cost            NUMERIC(10,2) DEFAULT 0,              -- Maliyet (TL)
    status          VARCHAR(20) CHECK (status IN ('Planlandı', 'Devam Ediyor', 'Tamamlandı', 'İptal')) DEFAULT 'Planlandı',
    scheduled_date  DATE,                                 -- Planlanan tarih
    completed_at    TIMESTAMPTZ,                          -- Tamamlanma tarihi
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE maintenance_logs IS 'Bakım/onarım işlemleri — maliyet takibi ve şikayet bağlantısı';

CREATE INDEX IF NOT EXISTS idx_maintenance_room ON maintenance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_complaint ON maintenance_logs(complaint_id);

-- ╔══════════════════════════════════════════════════════╗
-- ║  9. ÖDEME KAYITLARI (payments) — Ek Profesyonel      ║
-- ║  Yurt ücreti ödemelerinin takibi                      ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          NUMERIC(10,2) NOT NULL,               -- Ödeme tutarı (TL)
    payment_type    VARCHAR(30) CHECK (payment_type IN ('Yurt Ücreti', 'Depozito', 'Ceza', 'Diğer')) DEFAULT 'Yurt Ücreti',
    payment_method  VARCHAR(30) CHECK (payment_method IN ('Nakit', 'Havale', 'Kredi Kartı', 'Burs')) DEFAULT 'Havale',
    period_month    INTEGER CHECK (period_month BETWEEN 1 AND 12), -- Ödeme dönemi (ay)
    period_year     INTEGER,                              -- Ödeme dönemi (yıl)
    status          VARCHAR(20) CHECK (status IN ('Ödendi', 'Beklemede', 'Gecikmiş', 'İptal')) DEFAULT 'Beklemede',
    paid_at         TIMESTAMPTZ,                          -- Ödeme tarihi
    due_date        DATE,                                 -- Son ödeme tarihi
    receipt_url     VARCHAR(255),                          -- Dekont URL
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Yurt ücreti ödemeleri — dönem bazlı takip ve gecikme kontrolü';

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period_year, period_month);

-- ╔══════════════════════════════════════════════════════╗
-- ║  10. ZİYARETÇİ KAYITLARI (visitors) — Ek Profesyonel║
-- ║  Yurda gelen ziyaretçilerin kaydı                    ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS visitors (
    id              SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(id), -- Ziyaret edilen öğrenci
    visitor_name    VARCHAR(100) NOT NULL,                 -- Ziyaretçi adı
    visitor_tc      VARCHAR(11),                           -- Ziyaretçi TC
    visitor_phone   VARCHAR(20),                           -- Ziyaretçi telefon
    relation        VARCHAR(30),                           -- Yakınlık (Aile, Arkadaş vb.)
    check_in_time   TIMESTAMPTZ DEFAULT NOW(),             -- Giriş zamanı
    check_out_time  TIMESTAMPTZ,                           -- Çıkış zamanı
    logged_by       INTEGER REFERENCES users(id),          -- Kaydı giren güvenlik
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE visitors IS 'Yurt ziyaretçi kayıtları — güvenlik tarafından giriş-çıkış takibi';

CREATE INDEX IF NOT EXISTS idx_visitors_student ON visitors(student_user_id);
CREATE INDEX IF NOT EXISTS idx_visitors_date ON visitors(check_in_time);

-- ============================================================
-- YETKİLENDİRME — belek05 kullanıcısına tüm tablolarda
-- SELECT, INSERT, UPDATE, DELETE izinleri ver
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE buildings TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rooms TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_profiles TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_assignments TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE entry_exit_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE complaints TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE announcements TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payments TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE visitors TO belek05;

-- Mevcut users tablosu için de UPDATE ve DELETE yetkisi
GRANT UPDATE, DELETE ON TABLE public.users TO belek05;

-- Sequence'lar için de yetki ver (INSERT yapabilmesi için)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO belek05;

-- ============================================================
-- ÖRNEK VERİ — Test amaçlı başlangıç verileri
-- ============================================================

-- Binalar
INSERT INTO buildings (name, total_floors, gender_type, capacity) VALUES
    ('A Blok', 5, 'Erkek', 200),
    ('B Blok', 5, 'Kız', 200),
    ('C Blok', 4, 'Karma', 160)
ON CONFLICT DO NOTHING;

-- A Blok Odaları (1. ve 2. kat örnek)
INSERT INTO rooms (building_id, floor_number, room_number, capacity, room_type, has_bathroom, price_per_month, status) VALUES
    -- A Blok 1. Kat
    (1, 1, 'A-101', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 1, 'A-102', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 1, 'A-103', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 1, 'A-104', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 1, 'A-105', 1, 'Tek', TRUE,  2500.00, 'Boş'),
    -- A Blok 2. Kat
    (1, 2, 'A-201', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 2, 'A-202', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 2, 'A-203', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 2, 'A-204', 3, 'Üçlü', FALSE, 1200.00, 'Boş'),
    (1, 2, 'A-205', 1, 'Tek', TRUE,  2500.00, 'Boş'),
    -- B Blok 1. Kat
    (2, 1, 'B-101', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (2, 1, 'B-102', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (2, 1, 'B-103', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (2, 1, 'B-104', 3, 'Üçlü', FALSE, 1200.00, 'Boş'),
    -- C Blok 1. Kat
    (3, 1, 'C-101', 2, 'Çift', TRUE,  1600.00, 'Boş'),
    (3, 1, 'C-102', 2, 'Çift', TRUE,  1600.00, 'Boş'),
    (3, 1, 'C-103', 4, 'Dörtlü', FALSE, 1100.00, 'Boş')
ON CONFLICT DO NOTHING;

-- Öğrenci profilleri (mevcut öğrenci kullanıcıları için)
INSERT INTO student_profiles (user_id, student_number, phone, faculty, department, enrollment_year, class_year, address_city)
VALUES
    (23, '2024001', '05301234501', 'Mühendislik', 'Bilgisayar Mühendisliği', 2024, 1, 'Antalya'),
    (24, '2024002', '05301234502', 'Mühendislik', 'Elektrik-Elektronik', 2024, 1, 'Antalya'),
    (25, '2024003', '05301234503', 'Fen-Edebiyat', 'Matematik', 2024, 2, 'İstanbul'),
    (26, '2024004', '05301234504', 'İktisadi İdari Bilimler', 'İşletme', 2024, 1, 'Ankara'),
    (27, '2024005', '05301234505', 'Mühendislik', 'İnşaat Mühendisliği', 2024, 2, 'İzmir')
ON CONFLICT DO NOTHING;

-- Oda atamaları (öğrencilere oda ver)
INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by) VALUES
    (23, 1, '2024-09-15', 'Aktif', 19),   -- ogrenci1 → A-101
    (24, 1, '2024-09-15', 'Aktif', 19),   -- ogrenci2 → A-101 (oda arkadaşı)
    (25, 3, '2024-09-16', 'Aktif', 19),   -- ogrenci3 → A-103
    (26, 3, '2024-09-16', 'Aktif', 19),   -- ogrenci4 → A-103
    (27, 6, '2024-09-17', 'Aktif', 19)    -- ogrenci5 → A-201
ON CONFLICT DO NOTHING;

-- Oda doluluk güncelle
UPDATE rooms SET current_occupancy = 2, status = 'Dolu'  WHERE room_number = 'A-101' AND building_id = 1;
UPDATE rooms SET current_occupancy = 2, status = 'Kısmi' WHERE room_number = 'A-103' AND building_id = 1;
UPDATE rooms SET current_occupancy = 1, status = 'Kısmi' WHERE room_number = 'A-201' AND building_id = 1;

-- Örnek giriş-çıkış kayıtları
INSERT INTO entry_exit_logs (user_id, log_type, logged_at, logged_by, gate) VALUES
    (23, 'Çıkış', NOW() - INTERVAL '3 hours', 20, 'Ana Giriş'),
    (23, 'Giriş', NOW() - INTERVAL '1 hour', 20, 'Ana Giriş'),
    (24, 'Çıkış', NOW() - INTERVAL '5 hours', 20, 'Ana Giriş'),
    (25, 'Giriş', NOW() - INTERVAL '2 hours', 20, 'Yan Kapı'),
    (26, 'Çıkış', NOW() - INTERVAL '4 hours', 20, 'Ana Giriş'),
    (26, 'Giriş', NOW() - INTERVAL '30 minutes', 20, 'Ana Giriş')
ON CONFLICT DO NOTHING;

-- Örnek şikayet/arıza bildirimleri
INSERT INTO complaints (user_id, room_id, category, title, description, priority, status) VALUES
    (23, 1, 'Arıza', 'Banyo musluğu damlıyor', 'Banyodaki lavabo musluğu sürekli damlıyor, gece uyuyamıyorum.', 'Yüksek', 'Beklemede'),
    (24, 1, 'Temizlik', 'Koridorun temizlenmesi', 'Koridorlar uzun süredir temizlenmedi, kötü kokuyor.', 'Orta', 'İnceleniyor'),
    (25, 3, 'Arıza', 'Elektrik prizi çalışmıyor', 'Oda içindeki 2 numaralı priz tamamen çalışmıyor.', 'Yüksek', 'Beklemede'),
    (26, 3, 'Öneri', 'Çalışma odası talebi', 'Blokta bir çalışma odası olsa çok iyi olur.', 'Düşük', 'İnceleniyor'),
    (27, 6, 'Güvenlik', 'Kat kapısı kilidi bozuk', '2. kat kapısının kilidi çalışmıyor, gece güvenlik sorunu.', 'Acil', 'Beklemede')
ON CONFLICT DO NOTHING;

-- Örnek duyurular
INSERT INTO announcements (title, content, category, created_by, target_role, is_pinned) VALUES
    ('Yurt Kuralları Güncellendi', 'Yeni dönem yurt kuralları güncellenmiştir. Tüm öğrencilerin okuması rica olunur. Giriş-çıkış saatleri 06:00-00:00 olarak belirlenmiştir.', 'Kural', 19, NULL, TRUE),
    ('Su Kesintisi — 15 Mart', 'Bakım çalışması nedeniyle 15 Mart Cumartesi günü 10:00-14:00 arası su kesintisi yaşanacaktır.', 'Bakım', 19, NULL, FALSE),
    ('Bahar Şenliği Kayıtları', 'Üniversite bahar şenliği kayıtları başlamıştır. Detaylı bilgi için öğrenci işlerine başvurun.', 'Etkinlik', 19, 'Öğrenci', FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- DOĞRULAMA — Tüm tabloları kontrol et
-- ============================================================
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
