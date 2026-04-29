-- ============================================================
-- 🔧 YURT YÖNETİM SİSTEMİ — TEK ADIMDA KURULUM
-- ============================================================
-- Bu SQL dosyasını Neon SQL Editor'da (admin hesabıyla) çalıştırın:
--   1. https://console.neon.tech adresine gidin
--   2. Projenizi seçin → "SQL Editor" sekmesine tıklayın
--   3. Bu SQL'in TAMAMINI kopyalayıp yapıştırın
--   4. "Run" butonuna basın
-- ============================================================


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 1: KULLANICI ROLLERİNİ DÜZELT               ║
-- ╚══════════════════════════════════════════════════════╝

-- belek05 kullanıcısına users tablosunda UPDATE/DELETE yetkisi ver
GRANT UPDATE, DELETE ON TABLE public.users TO belek05;

-- İngilizce/hatalı roller → Türkçe'ye çevir
UPDATE users SET user_type = 'Öğrenci' WHERE user_type IN ('Student', 'student', 'string');
UPDATE users SET user_type = 'Yönetici' WHERE user_type = 'Academician';

-- Kontrol: Roller düzgün mü?
SELECT user_type, COUNT(*) as sayi FROM users GROUP BY user_type ORDER BY user_type;


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 2: BİNA VE ODA TABLOLARI                     ║
-- ╚══════════════════════════════════════════════════════╝

-- 2.1 Binalar
CREATE TABLE IF NOT EXISTS buildings (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    address         TEXT,
    total_floors    INTEGER NOT NULL DEFAULT 1,
    gender_type     VARCHAR(10) CHECK (gender_type IN ('Erkek', 'Kız', 'Karma')) DEFAULT 'Karma',
    capacity        INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Odalar
CREATE TABLE IF NOT EXISTS rooms (
    id              SERIAL PRIMARY KEY,
    building_id     INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number    INTEGER NOT NULL DEFAULT 1,
    room_number     VARCHAR(20) NOT NULL,
    capacity        INTEGER NOT NULL DEFAULT 2,
    current_occupancy INTEGER NOT NULL DEFAULT 0,
    room_type       VARCHAR(20) CHECK (room_type IN ('Tek', 'Çift', 'Üçlü', 'Dörtlü')) DEFAULT 'Çift',
    has_bathroom    BOOLEAN DEFAULT FALSE,
    has_balcony     BOOLEAN DEFAULT FALSE,
    has_ac          BOOLEAN DEFAULT FALSE,
    price_per_month NUMERIC(10,2) DEFAULT 0,
    status          VARCHAR(20) CHECK (status IN ('Boş', 'Dolu', 'Kısmi', 'Bakımda', 'Kapalı')) DEFAULT 'Boş',
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(building_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 3: ÖĞRENCİ TABLOLARI                        ║
-- ╚══════════════════════════════════════════════════════╝

-- 3.1 Öğrenci Profilleri
CREATE TABLE IF NOT EXISTS student_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_number          VARCHAR(20) UNIQUE,
    tc_no                   VARCHAR(11) UNIQUE,
    birth_date              DATE,
    gender                  VARCHAR(10) CHECK (gender IN ('Erkek', 'Kadın', 'Diğer')),
    phone                   VARCHAR(20),
    faculty                 VARCHAR(100),
    department              VARCHAR(100),
    enrollment_year         INTEGER,
    class_year              INTEGER CHECK (class_year BETWEEN 1 AND 6),
    blood_type              VARCHAR(5) CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','0+','0-')),
    chronic_diseases        TEXT,
    allergies               TEXT,
    address_city            VARCHAR(50),
    address_district        VARCHAR(50),
    address_full            TEXT,
    guardian_name           VARCHAR(100),
    guardian_phone          VARCHAR(20),
    guardian_relation       VARCHAR(30),
    emergency_contact_name  VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    profile_photo_url       VARCHAR(255),
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_number ON student_profiles(student_number);

-- 3.2 Oda Atamaları
CREATE TABLE IF NOT EXISTS room_assignments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    check_in_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    check_out_date  DATE,
    status          VARCHAR(20) CHECK (status IN ('Aktif', 'Çıkış', 'Transfer', 'İptal')) DEFAULT 'Aktif',
    assigned_by     INTEGER REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON room_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_room ON room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON room_assignments(status);

-- 3.3 Disiplin Kayıtları
CREATE TABLE IF NOT EXISTS student_warnings (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warning_type    VARCHAR(30) NOT NULL,
    reason          TEXT NOT NULL,
    description     TEXT,
    severity        VARCHAR(10) CHECK (severity IN ('Hafif', 'Orta', 'Ağır', 'Çok Ağır')) DEFAULT 'Orta',
    issued_by       INTEGER NOT NULL REFERENCES users(id),
    incident_date   DATE DEFAULT CURRENT_DATE,
    appeal_status   VARCHAR(20) DEFAULT 'Yok',
    appeal_notes    TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    expires_at      DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warnings_user ON student_warnings(user_id);

-- 3.4 Öğrenci Belgeleri
CREATE TABLE IF NOT EXISTS student_documents (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type   VARCHAR(50) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_url        VARCHAR(500),
    file_size       INTEGER,
    mime_type       VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'Yüklendi',
    verified_by     INTEGER REFERENCES users(id),
    verified_at     TIMESTAMPTZ,
    expiry_date     DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON student_documents(user_id);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 4: GİRİŞ-ÇIKIŞ VE GÜVENLİK                 ║
-- ╚══════════════════════════════════════════════════════╝

-- 4.1 Giriş-Çıkış Kayıtları
CREATE TABLE IF NOT EXISTS entry_exit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_type        VARCHAR(10) NOT NULL CHECK (log_type IN ('Giriş', 'Çıkış')),
    logged_at       TIMESTAMPTZ DEFAULT NOW(),
    logged_by       INTEGER REFERENCES users(id),
    gate            VARCHAR(50),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_exit_user ON entry_exit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_exit_type ON entry_exit_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_entry_exit_date ON entry_exit_logs(logged_at);

-- 4.2 Ziyaretçi Kayıtları
CREATE TABLE IF NOT EXISTS visitors (
    id              SERIAL PRIMARY KEY,
    student_user_id INTEGER NOT NULL REFERENCES users(id),
    visitor_name    VARCHAR(100) NOT NULL,
    visitor_tc      VARCHAR(11),
    visitor_phone   VARCHAR(20),
    relation        VARCHAR(30),
    check_in_time   TIMESTAMPTZ DEFAULT NOW(),
    check_out_time  TIMESTAMPTZ,
    logged_by       INTEGER REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitors_student ON visitors(student_user_id);
CREATE INDEX IF NOT EXISTS idx_visitors_date ON visitors(check_in_time);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 5: ŞİKAYETLER VE BAKIM                      ║
-- ╚══════════════════════════════════════════════════════╝

-- 5.1 Şikayetler
CREATE TABLE IF NOT EXISTS complaints (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id         INTEGER REFERENCES rooms(id),
    category        VARCHAR(30) NOT NULL CHECK (category IN ('Arıza', 'Şikayet', 'Öneri', 'Temizlik', 'Güvenlik', 'Diğer')),
    title           VARCHAR(200) NOT NULL,
    description     TEXT NOT NULL,
    priority        VARCHAR(10) CHECK (priority IN ('Düşük', 'Orta', 'Yüksek', 'Acil')) DEFAULT 'Orta',
    status          VARCHAR(20) CHECK (status IN ('Beklemede', 'İnceleniyor', 'Çözüldü', 'Reddedildi')) DEFAULT 'Beklemede',
    assigned_to     INTEGER REFERENCES users(id),
    response        TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);

-- 5.2 Bakım Kayıtları
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER REFERENCES rooms(id),
    complaint_id    INTEGER REFERENCES complaints(id),
    description     TEXT NOT NULL,
    performed_by    INTEGER REFERENCES users(id),
    maintenance_type VARCHAR(30) CHECK (maintenance_type IN ('Elektrik', 'Tesisat', 'Mobilya', 'Boya', 'Temizlik', 'Klima', 'Diğer')) DEFAULT 'Diğer',
    cost            NUMERIC(10,2) DEFAULT 0,
    status          VARCHAR(20) CHECK (status IN ('Planlandı', 'Devam Ediyor', 'Tamamlandı', 'İptal')) DEFAULT 'Planlandı',
    scheduled_date  DATE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_room ON maintenance_logs(room_id);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 6: DUYURULAR VE BİLDİRİMLER                 ║
-- ╚══════════════════════════════════════════════════════╝

-- 6.1 Duyurular
CREATE TABLE IF NOT EXISTS announcements (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    category        VARCHAR(30) CHECK (category IN ('Genel', 'Acil', 'Bakım', 'Etkinlik', 'Kural')) DEFAULT 'Genel',
    created_by      INTEGER REFERENCES users(id),
    target_role     VARCHAR(30),
    is_pinned       BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, expires_at);

-- 6.2 Bildirim Kayıtları
CREATE TABLE IF NOT EXISTS notification_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    notification_type VARCHAR(30) DEFAULT 'Bilgi',
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    related_type    VARCHAR(50),
    related_id      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notification_logs(is_read);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 7: ÖDEMELER VE İZİNLER                      ║
-- ╚══════════════════════════════════════════════════════╝

-- 7.1 Ödemeler
CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          NUMERIC(10,2) NOT NULL,
    payment_type    VARCHAR(30) CHECK (payment_type IN ('Yurt Ücreti', 'Depozito', 'Ceza', 'Diğer')) DEFAULT 'Yurt Ücreti',
    payment_method  VARCHAR(30) CHECK (payment_method IN ('Nakit', 'Havale', 'Kredi Kartı', 'Burs')) DEFAULT 'Havale',
    period_month    INTEGER CHECK (period_month BETWEEN 1 AND 12),
    period_year     INTEGER,
    status          VARCHAR(20) CHECK (status IN ('Ödendi', 'Beklemede', 'Gecikmiş', 'İptal')) DEFAULT 'Beklemede',
    paid_at         TIMESTAMPTZ,
    due_date        DATE,
    receipt_url     VARCHAR(255),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 7.2 İzin Talepleri
CREATE TABLE IF NOT EXISTS leave_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type      VARCHAR(30) NOT NULL CHECK (leave_type IN ('Hafta Sonu', 'Tatil', 'Sağlık', 'Aile', 'Resmi', 'Diğer')),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason          TEXT NOT NULL,
    destination     VARCHAR(200),
    guardian_approval BOOLEAN DEFAULT FALSE,
    status          VARCHAR(20) CHECK (status IN ('Beklemede', 'Onaylandı', 'Reddedildi', 'İptal', 'Dönüş Yapıldı')) DEFAULT 'Beklemede',
    approved_by     INTEGER REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    return_date     TIMESTAMPTZ,
    rejection_reason TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 8: TRANSFER VE DENETİM                      ║
-- ╚══════════════════════════════════════════════════════╝

-- 8.1 Oda Transfer Talepleri
CREATE TABLE IF NOT EXISTS room_transfer_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_room_id INTEGER REFERENCES rooms(id),
    requested_room_id INTEGER REFERENCES rooms(id),
    reason          TEXT NOT NULL,
    priority        VARCHAR(10) DEFAULT 'Orta',
    status          VARCHAR(20) DEFAULT 'Beklemede',
    approved_by     INTEGER REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    rejection_reason TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_user ON room_transfer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_status ON room_transfer_requests(status);

-- 8.2 Oda Envanterleri
CREATE TABLE IF NOT EXISTS room_inventory (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    item_name       VARCHAR(100) NOT NULL,
    item_code       VARCHAR(50),
    quantity        INTEGER NOT NULL DEFAULT 1,
    condition       VARCHAR(20) CHECK (condition IN ('Yeni', 'İyi', 'Orta', 'Kötü', 'Kullanılamaz')) DEFAULT 'İyi',
    purchase_date   DATE,
    last_check_date DATE,
    checked_by      INTEGER REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_room ON room_inventory(room_id);

-- 8.3 Denetim Kayıtları (güncelleme — zaten varsa atla)
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       INTEGER,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 9: YETKİLENDİRME                            ║
-- ╚══════════════════════════════════════════════════════╝

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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_transfer_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_documents TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_warnings TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_inventory TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO belek05;
GRANT UPDATE, DELETE ON TABLE public.users TO belek05;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO belek05;


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 10: ÖRNEK VERİLER                           ║
-- ╚══════════════════════════════════════════════════════╝

-- 10.1 Binalar
INSERT INTO buildings (name, address, total_floors, gender_type, capacity) VALUES
    ('A Blok', 'Kampüs Ana Yol No:1', 5, 'Erkek', 200),
    ('B Blok', 'Kampüs Ana Yol No:2', 5, 'Kız', 200),
    ('C Blok', 'Kampüs Ana Yol No:3', 4, 'Karma', 160)
ON CONFLICT DO NOTHING;

-- 10.2 Odalar
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

-- 10.3 Öğrenci Profilleri (mevcut Öğrenci kullanıcıları için)
-- Not: user_id'leri kendi veritabanınıza göre ayarlayın
DO $$
DECLARE
    student_ids INTEGER[];
    sid INTEGER;
    counter INTEGER := 1;
    faculties TEXT[] := ARRAY['Mühendislik', 'Fen-Edebiyat', 'İktisadi İdari Bilimler', 'Tıp', 'Hukuk'];
    departments TEXT[] := ARRAY['Bilgisayar Müh.', 'Matematik', 'İşletme', 'Tıp', 'Hukuk'];
    cities TEXT[] := ARRAY['Antalya', 'İstanbul', 'Ankara', 'İzmir', 'Bursa'];
BEGIN
    SELECT array_agg(id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE;
    IF student_ids IS NOT NULL THEN
        FOREACH sid IN ARRAY student_ids LOOP
            INSERT INTO student_profiles (user_id, student_number, phone, faculty, department, enrollment_year, class_year, address_city, gender)
            VALUES (
                sid,
                '2024' || LPAD(counter::TEXT, 3, '0'),
                '053012345' || LPAD(counter::TEXT, 2, '0'),
                faculties[((counter - 1) % 5) + 1],
                departments[((counter - 1) % 5) + 1],
                2024,
                ((counter - 1) % 4) + 1,
                cities[((counter - 1) % 5) + 1],
                CASE WHEN counter % 2 = 0 THEN 'Kadın' ELSE 'Erkek' END
            )
            ON CONFLICT (user_id) DO NOTHING;
            counter := counter + 1;
        END LOOP;
        RAISE NOTICE '✓ % öğrenci profili oluşturuldu', array_length(student_ids, 1);
    END IF;
END $$;

-- 10.4 Oda Atamaları (ilk 5 öğrenciye oda ver)
DO $$
DECLARE
    student_ids INTEGER[];
    manager_id INTEGER;
    room_ids INTEGER[];
BEGIN
    SELECT array_agg(id ORDER BY id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 5;
    SELECT id INTO manager_id FROM users WHERE user_type IN ('Yönetici', 'Admin', 'SuperAdmin') AND is_active = TRUE LIMIT 1;
    SELECT array_agg(id ORDER BY id) INTO room_ids FROM rooms WHERE is_active = TRUE LIMIT 5;
    
    IF student_ids IS NOT NULL AND room_ids IS NOT NULL AND manager_id IS NOT NULL THEN
        -- Öğrenci 1 & 2 → Oda 1 (A-101)
        INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by)
        VALUES (student_ids[1], room_ids[1], '2024-09-15', 'Aktif', manager_id)
        ON CONFLICT DO NOTHING;
        IF array_length(student_ids, 1) >= 2 THEN
            INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by)
            VALUES (student_ids[2], room_ids[1], '2024-09-15', 'Aktif', manager_id)
            ON CONFLICT DO NOTHING;
        END IF;
        -- Öğrenci 3 & 4 → Oda 3 (A-103)
        IF array_length(student_ids, 1) >= 3 THEN
            INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by)
            VALUES (student_ids[3], room_ids[3], '2024-09-16', 'Aktif', manager_id)
            ON CONFLICT DO NOTHING;
        END IF;
        IF array_length(student_ids, 1) >= 4 THEN
            INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by)
            VALUES (student_ids[4], room_ids[3], '2024-09-16', 'Aktif', manager_id)
            ON CONFLICT DO NOTHING;
        END IF;
        -- Öğrenci 5 → Oda 6 (A-201)
        IF array_length(student_ids, 1) >= 5 AND array_length(room_ids, 1) >= 5 THEN
            INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by)
            VALUES (student_ids[5], room_ids[5], '2024-09-17', 'Aktif', manager_id)
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- Oda doluluk güncelle
        UPDATE rooms SET current_occupancy = 2, status = 'Dolu'  WHERE id = room_ids[1];
        UPDATE rooms SET current_occupancy = 2, status = 'Kısmi' WHERE id = room_ids[3];
        IF array_length(room_ids, 1) >= 5 THEN
            UPDATE rooms SET current_occupancy = 1, status = 'Kısmi' WHERE id = room_ids[5];
        END IF;
        
        RAISE NOTICE '✓ Oda atamaları tamamlandı';
    END IF;
END $$;

-- 10.5 Örnek Giriş-Çıkış Kayıtları
DO $$
DECLARE
    student_ids INTEGER[];
    guard_id INTEGER;
BEGIN
    SELECT array_agg(id ORDER BY id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 5;
    SELECT id INTO guard_id FROM users WHERE user_type IN ('Güvenlik', 'Yönetici', 'Admin') AND is_active = TRUE LIMIT 1;
    
    IF student_ids IS NOT NULL AND guard_id IS NOT NULL THEN
        INSERT INTO entry_exit_logs (user_id, log_type, logged_at, logged_by, gate) VALUES
            (student_ids[1], 'Çıkış', NOW() - INTERVAL '3 hours', guard_id, 'Ana Giriş'),
            (student_ids[1], 'Giriş', NOW() - INTERVAL '1 hour', guard_id, 'Ana Giriş'),
            (student_ids[2], 'Çıkış', NOW() - INTERVAL '5 hours', guard_id, 'Ana Giriş'),
            (student_ids[3], 'Giriş', NOW() - INTERVAL '2 hours', guard_id, 'Yan Kapı'),
            (student_ids[4], 'Çıkış', NOW() - INTERVAL '4 hours', guard_id, 'Ana Giriş'),
            (student_ids[4], 'Giriş', NOW() - INTERVAL '30 minutes', guard_id, 'Ana Giriş');
        RAISE NOTICE '✓ 6 giriş-çıkış kaydı oluşturuldu';
    END IF;
END $$;

-- 10.6 Örnek Şikayetler
DO $$
DECLARE
    student_ids INTEGER[];
    room_ids INTEGER[];
BEGIN
    SELECT array_agg(id ORDER BY id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 5;
    SELECT array_agg(id ORDER BY id) INTO room_ids FROM rooms LIMIT 5;
    
    IF student_ids IS NOT NULL AND room_ids IS NOT NULL THEN
        INSERT INTO complaints (user_id, room_id, category, title, description, priority, status) VALUES
            (student_ids[1], room_ids[1], 'Arıza', 'Banyo musluğu damlıyor', 'Banyodaki lavabo musluğu sürekli damlıyor, gece uyuyamıyorum.', 'Yüksek', 'Beklemede'),
            (student_ids[2], room_ids[1], 'Temizlik', 'Koridorun temizlenmesi', 'Koridorlar uzun süredir temizlenmedi.', 'Orta', 'İnceleniyor'),
            (student_ids[3], room_ids[3], 'Arıza', 'Elektrik prizi çalışmıyor', 'Oda içindeki 2 numaralı priz tamamen çalışmıyor.', 'Yüksek', 'Beklemede'),
            (student_ids[4], room_ids[3], 'Öneri', 'Çalışma odası talebi', 'Blokta bir çalışma odası olsa çok iyi olur.', 'Düşük', 'İnceleniyor'),
            (student_ids[1], room_ids[1], 'Güvenlik', 'Kat kapısı kilidi bozuk', '2. kat kapısının kilidi çalışmıyor.', 'Acil', 'Beklemede');
        RAISE NOTICE '✓ 5 şikayet kaydı oluşturuldu';
    END IF;
END $$;

-- 10.7 Örnek Duyurular
DO $$
DECLARE
    manager_id INTEGER;
BEGIN
    SELECT id INTO manager_id FROM users WHERE user_type IN ('Yönetici', 'Admin', 'SuperAdmin') AND is_active = TRUE LIMIT 1;
    
    IF manager_id IS NOT NULL THEN
        INSERT INTO announcements (title, content, category, created_by, target_role, is_pinned) VALUES
            ('Yurt Kuralları Güncellendi', 'Yeni dönem yurt kuralları güncellenmiştir. Tüm öğrencilerin okuması rica olunur. Giriş-çıkış saatleri 06:00-00:00 olarak belirlenmiştir.', 'Kural', manager_id, NULL, TRUE),
            ('Su Kesintisi — 15 Mart', 'Bakım çalışması nedeniyle 15 Mart Cumartesi günü 10:00-14:00 arası su kesintisi yaşanacaktır.', 'Bakım', manager_id, NULL, FALSE),
            ('Bahar Şenliği Kayıtları', 'Üniversite bahar şenliği kayıtları başlamıştır. Detaylı bilgi için öğrenci işlerine başvurun.', 'Etkinlik', manager_id, 'Öğrenci', FALSE);
        RAISE NOTICE '✓ 3 duyuru oluşturuldu';
    END IF;
END $$;

-- 10.8 Örnek Bakım Kayıtları
DO $$
DECLARE
    room_ids INTEGER[];
    maint_id INTEGER;
BEGIN
    SELECT array_agg(id ORDER BY id) INTO room_ids FROM rooms LIMIT 3;
    SELECT id INTO maint_id FROM users WHERE user_type IN ('Bakım', 'Yönetici') AND is_active = TRUE LIMIT 1;
    
    IF room_ids IS NOT NULL AND maint_id IS NOT NULL THEN
        INSERT INTO maintenance_logs (room_id, description, performed_by, maintenance_type, cost, status) VALUES
            (room_ids[1], 'Musluk tamiri', maint_id, 'Tesisat', 150.00, 'Planlandı'),
            (room_ids[2], 'Elektrik arızası giderimi', maint_id, 'Elektrik', 200.00, 'Devam Ediyor'),
            (room_ids[3], 'Oda boyama', maint_id, 'Boya', 500.00, 'Tamamlandı');
        -- Tamamlanan bakımın tarihini güncelle
        UPDATE maintenance_logs SET completed_at = NOW() - INTERVAL '2 days' WHERE description = 'Oda boyama';
        RAISE NOTICE '✓ 3 bakım kaydı oluşturuldu';
    END IF;
END $$;

-- 10.9 Örnek Ödemeler
DO $$
DECLARE
    student_ids INTEGER[];
BEGIN
    SELECT array_agg(id ORDER BY id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 5;
    
    IF student_ids IS NOT NULL THEN
        INSERT INTO payments (user_id, amount, payment_type, period_month, period_year, due_date, status) VALUES
            (student_ids[1], 1500, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi'),
            (student_ids[1], 1500, 'Yurt Ücreti', 4, 2026, '2026-04-15', 'Beklemede'),
            (student_ids[2], 1500, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi'),
            (student_ids[2], 1500, 'Yurt Ücreti', 4, 2026, '2026-04-15', 'Beklemede'),
            (student_ids[3], 1000, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Gecikmiş'),
            (student_ids[4], 1000, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi');
        -- Ödenen kayıtların tarihini güncelle
        UPDATE payments SET paid_at = NOW() - INTERVAL '5 days' WHERE status = 'Ödendi';
        RAISE NOTICE '✓ 6 ödeme kaydı oluşturuldu';
    END IF;
END $$;

-- 10.10 Örnek İzin Talepleri
DO $$
DECLARE
    student_ids INTEGER[];
    manager_id INTEGER;
BEGIN
    SELECT array_agg(id ORDER BY id) INTO student_ids FROM users WHERE user_type = 'Öğrenci' AND is_active = TRUE LIMIT 5;
    SELECT id INTO manager_id FROM users WHERE user_type IN ('Yönetici', 'Admin', 'SuperAdmin') AND is_active = TRUE LIMIT 1;
    
    IF student_ids IS NOT NULL AND manager_id IS NOT NULL THEN
        INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, destination, status, approved_by) VALUES
            (student_ids[1], 'Hafta Sonu', '2026-03-14', '2026-03-16', 'Ailemle buluşma', 'Antalya', 'Onaylandı', manager_id),
            (student_ids[2], 'Sağlık', '2026-03-12', '2026-03-13', 'Doktor randevusu', 'Hastane', 'Beklemede', NULL),
            (student_ids[3], 'Aile', '2026-03-20', '2026-03-23', 'Kardeşimin düğünü', 'İstanbul', 'Beklemede', NULL),
            (student_ids[4], 'Tatil', '2026-03-28', '2026-04-05', 'Bahar tatili', 'Ankara', 'Reddedildi', manager_id);
        RAISE NOTICE '✓ 4 izin talebi oluşturuldu';
    END IF;
END $$;


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 11: DOĞRULAMA                               ║
-- ╚══════════════════════════════════════════════════════╝

-- Tabloları ve kayıt sayılarını göster
SELECT 
    t.table_name AS "Tablo",
    (xpath('/row/cnt/text()', xml_count))[1]::text::int AS "Kayıt Sayısı"
FROM information_schema.tables t
CROSS JOIN LATERAL (
    SELECT query_to_xml('SELECT COUNT(*) AS cnt FROM ' || t.table_name, false, true, '')
) AS x(xml_count)
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
