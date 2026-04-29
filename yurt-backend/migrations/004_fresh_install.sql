-- ============================================================
-- YURT YÖNETİM SİSTEMİ — TAM KURULUM (YENİ PROJE)
-- ============================================================
-- Bu SQL'i Neon SQL Editor'da çalıştırın (neondb_owner olarak)
-- Tüm authRoleları, kullanıcıları ve uygulama tablolarını oluşturur
-- ============================================================


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 1: belek05 ROLÜ OLUŞTUR                     ║
-- ╚══════════════════════════════════════════════════════╝

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'belek05') THEN
        CREATE ROLE belek05 WITH LOGIN PASSWORD 'Yusuf7005@2026';
        RAISE NOTICE 'belek05 rolü oluşturuldu';
    ELSE
        RAISE NOTICE 'belek05 rolü zaten var';
    END IF;
END $$;

-- Schema yetkisi
GRANT USAGE, CREATE ON SCHEMA public TO belek05;


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 2: AUTH TABLOLARI                           ║
-- ╚══════════════════════════════════════════════════════╝

-- 2.1 Users
CREATE TABLE IF NOT EXISTS users (
    id                      SERIAL PRIMARY KEY,
    username                VARCHAR(50) NOT NULL UNIQUE,
    email                   VARCHAR(254) NOT NULL UNIQUE,
    password_hash           VARCHAR(255) NOT NULL,
    first_name              VARCHAR(100),
    last_name               VARCHAR(100),
    user_type               VARCHAR(30) DEFAULT 'Öğrenci',
    is_active               BOOLEAN DEFAULT TRUE,
    created_by              INTEGER REFERENCES users(id),
    updated_by              INTEGER REFERENCES users(id),
    create_date             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_date             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    profile_image_url       VARCHAR(500),
    phone                   VARCHAR(20),
    is_email_verified       BOOLEAN DEFAULT FALSE,
    email_verified_at       TIMESTAMP,
    password_reset_token    VARCHAR(128),
    password_reset_expires  TIMESTAMP,
    language_code           VARCHAR(5) DEFAULT 'tr'
);

-- 2.2 Roles
CREATE TABLE IF NOT EXISTS roles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    description     VARCHAR(255),
    created_by      INTEGER REFERENCES users(id),
    updated_by      INTEGER REFERENCES users(id),
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    update_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

-- 2.3 Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(100) NOT NULL UNIQUE,
    description         VARCHAR(255),
    create_date         TIMESTAMP DEFAULT NOW(),
    update_date         TIMESTAMP DEFAULT NOW(),
    operation_user_id   INTEGER NOT NULL DEFAULT 1
);

-- 2.4 User Roles
CREATE TABLE IF NOT EXISTS user_roles (
    user_id             INTEGER NOT NULL REFERENCES users(id),
    role_id             INTEGER NOT NULL REFERENCES roles(id),
    create_date         TIMESTAMPTZ DEFAULT NOW(),
    update_date         TIMESTAMPTZ DEFAULT NOW(),
    operation_user_id   INTEGER NOT NULL DEFAULT 1,
    archive_action      VARCHAR(20),
    archive_date        TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- 2.5 Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    permission_id   INTEGER NOT NULL REFERENCES permissions(id),
    create_date     TIMESTAMPTZ DEFAULT NOW(),
    update_date     TIMESTAMPTZ DEFAULT NOW(),
    archive_action  VARCHAR(20),
    archive_date    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- 2.6 Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    token       VARCHAR NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    create_date TIMESTAMPTZ DEFAULT NOW(),
    update_date TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id                  SERIAL PRIMARY KEY,
    platform_user_id    INTEGER NOT NULL REFERENCES users(id),
    token               VARCHAR(255) NOT NULL,
    expires_at          TIMESTAMP NOT NULL,
    is_used             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 User Schemas
CREATE TABLE IF NOT EXISTS user_schemas (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    schema_name         VARCHAR(100) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_date        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_date        TIMESTAMP,
    operation_user_id   BIGINT,
    archive_action      VARCHAR(20),
    archive_date        TIMESTAMP
);

-- 2.9 Archive tables
CREATE TABLE IF NOT EXISTS user_roles_archive (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER,
    role_id         INTEGER,
    operation_user_id INTEGER,
    archive_action  VARCHAR(50),
    archive_date    TIMESTAMP,
    create_date     TIMESTAMP DEFAULT NOW(),
    update_date     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions_archive (
    id              SERIAL PRIMARY KEY,
    role_id         INTEGER,
    permission_id   INTEGER,
    archive_action  VARCHAR(50),
    archive_date    TIMESTAMP,
    create_date     TIMESTAMP DEFAULT NOW(),
    update_date     TIMESTAMP DEFAULT NOW()
);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 3: KULLANICILARI VE ROLLERİ EKLE            ║
-- ╚══════════════════════════════════════════════════════╝

-- 3.1 Roller
INSERT INTO roles (id, name, description, is_active) VALUES
    (1, 'Admin', NULL, TRUE),
    (2, 'STUDENT', 'Öğrenci rolü', TRUE),
    (3, 'ACADEMIC', 'Akademik personel', TRUE),
    (4, 'ADMIN', 'Sistem yöneticisi', TRUE),
    (5, 'COORDINATOR', 'Etkinlik / topluluk koordinatörü', TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles));

-- 3.2 Kullanıcılar (tüm mevcut kullanıcılar — şifre hash'leri korunuyor)
-- Test1234! şifreli kullanıcılar: yonetici, guvenlik, temizlik, bakim, ogrenci1-5
INSERT INTO users (id, username, email, password_hash, first_name, last_name, user_type, is_active, is_email_verified, language_code) VALUES
    (1,  'testuser', 'test@example.com', '$2b$12$yenisifrehash', NULL, NULL, 'Öğrenci', TRUE, TRUE, 'tr'),
    (5,  'aysenurcandan', 'aysenurcandan1910@icloud.com', '$2a$11$Nw50.n.8wdng4bq6f8.LTe9/c2BXCfdz98Dy4mvZcpG4oy8dgyoLW', 'Ayşenur', 'Candan', 'Öğrenci', TRUE, TRUE, 'tr'),
    (7,  'canel_Kursat', 'kursat@gmail.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Kürşat', 'Canel', 'SuperAdmin', TRUE, FALSE, 'tr'),
    (8,  'samet_65', 'samet65@gmail.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Samet', 'Özütutar', 'Öğrenci', TRUE, FALSE, 'tr'),
    (9,  'medenisipan', 'medenisipan21@gmail.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Sipan', 'Medeni', 'SuperAdmin', TRUE, FALSE, 'tr'),
    (10, 'eniscagankurt', 'eniscagankur@gmail.com', '$2a$11$FYiu9QQhMl3hARGwyEQSzOPls3IMuLOG7H00GiBAF9vOHaz8It6VG', 'Enis Çağan', 'Kurt', 'Öğrenci', TRUE, TRUE, 'tr'),
    (11, 'yunusemre', 'yunusemresekerci6@gmail.com', '$2a$11$EmDZSZ9pXW/f4hzeR8lLaeNwGK1cNRa2Lmw6MysOOSqQ9GQnbhs0y', 'Yunus Emre', 'Şekerci', 'Öğrenci', TRUE, TRUE, 'tr'),
    (13, 'tariktopuz', 'boshesappders@gmail.com', '$2a$11$93zI3f.PPe9B4VQ3UGwIhe6qI3IgbPMDSb0NgIDNHWu7vPyLBCUVS', 'Tarık', 'Topuz', 'Admin', TRUE, TRUE, 'tr'),
    (16, 'alibirgullu', 'birgullua@gmail.com', '$2a$11$sYiwtB5EGyibqoCeNpHA0eW1UE9qqCfGS/AQQgVW9JRyutwHXg2Ky', 'Ali', 'Birgüllü', 'SuperAdmin', TRUE, TRUE, 'tr'),
    (18, 'kursatcanel', 'kursatcanel580@gmail.com', '$2a$11$pQlA.OR.8oVHmrUK6gzXmu5Q43rEkicXAlg9mcuIqKf1I3zGPJ/C2', 'Kürşat', 'Canel', 'Öğrenci', TRUE, TRUE, 'tr'),
    (19, 'yonetici', 'yonetici@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Ahmet', 'Yılmaz', 'Yönetici', TRUE, TRUE, 'tr'),
    (20, 'guvenlik', 'guvenlik@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Mehmet', 'Kaya', 'Güvenlik', TRUE, TRUE, 'tr'),
    (21, 'temizlik', 'temizlik@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Ayşe', 'Demir', 'Temizlik', TRUE, TRUE, 'tr'),
    (22, 'bakim', 'bakim@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Ali', 'Çelik', 'Bakım', TRUE, TRUE, 'tr'),
    (23, 'ogrenci1', 'ogrenci1@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Zeynep', 'Arslan', 'Öğrenci', TRUE, TRUE, 'tr'),
    (24, 'ogrenci2', 'ogrenci2@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Emre', 'Şahin', 'Öğrenci', TRUE, TRUE, 'tr'),
    (25, 'ogrenci3', 'ogrenci3@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Elif', 'Yıldız', 'Öğrenci', TRUE, TRUE, 'tr'),
    (26, 'ogrenci4', 'ogrenci4@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Burak', 'Öztürk', 'Öğrenci', TRUE, TRUE, 'tr'),
    (27, 'ogrenci5', 'ogrenci5@yurt.com', '$2b$10$b0YrrkkH4fCXsZ2GE.7/yuhO0fT/ZtH6S/sEVf0wWpKQC6TTXhjn6', 'Selin', 'Aydın', 'Öğrenci', TRUE, TRUE, 'tr')
ON CONFLICT (id) DO NOTHING;

-- Sequence güncelle
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 4: BİNA VE ODA TABLOLARI                    ║
-- ╚══════════════════════════════════════════════════════╝

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
-- ║  BÖLÜM 5: ÖĞRENCİ TABLOLARI                       ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS student_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 6: GİRİŞ-ÇIKIŞ VE GÜVENLİK                ║
-- ╚══════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 7: ŞİKAYETLER VE BAKIM                     ║
-- ╚══════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 8: DUYURULAR VE BİLDİRİMLER                ║
-- ╚══════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 9: ÖDEMELER VE İZİNLER                     ║
-- ╚══════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 10: TRANSFER VE DENETİM                    ║
-- ╚══════════════════════════════════════════════════════╝

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


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 11: TÜM YETKİLER                           ║
-- ╚══════════════════════════════════════════════════════╝

-- Auth tabloları
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE roles TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE permissions TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_roles TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE role_permissions TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE password_reset_tokens TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_schemas TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_roles_archive TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE role_permissions_archive TO belek05;

-- Uygulama tabloları
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE buildings TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rooms TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_profiles TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_assignments TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_warnings TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_documents TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE entry_exit_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE visitors TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE complaints TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE maintenance_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE announcements TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payments TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_transfer_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_inventory TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO belek05;

-- Tüm sequence'lar
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO belek05;


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 12: ÖRNEK VERİLER                          ║
-- ╚══════════════════════════════════════════════════════╝

-- 12.1 Binalar
INSERT INTO buildings (name, address, total_floors, gender_type, capacity) VALUES
    ('A Blok', 'Kampüs Ana Yol No:1', 5, 'Erkek', 200),
    ('B Blok', 'Kampüs Ana Yol No:2', 5, 'Kız', 200),
    ('C Blok', 'Kampüs Ana Yol No:3', 4, 'Karma', 160)
ON CONFLICT DO NOTHING;

-- 12.2 Odalar
INSERT INTO rooms (building_id, floor_number, room_number, capacity, room_type, has_bathroom, price_per_month, status) VALUES
    (1, 1, 'A-101', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 1, 'A-102', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 1, 'A-103', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 1, 'A-104', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 1, 'A-105', 1, 'Tek', TRUE,  2500.00, 'Boş'),
    (1, 2, 'A-201', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 2, 'A-202', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (1, 2, 'A-203', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (1, 2, 'A-204', 3, 'Üçlü', FALSE, 1200.00, 'Boş'),
    (1, 2, 'A-205', 1, 'Tek', TRUE,  2500.00, 'Boş'),
    (2, 1, 'B-101', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (2, 1, 'B-102', 2, 'Çift', TRUE,  1500.00, 'Boş'),
    (2, 1, 'B-103', 4, 'Dörtlü', FALSE, 1000.00, 'Boş'),
    (2, 1, 'B-104', 3, 'Üçlü', FALSE, 1200.00, 'Boş'),
    (3, 1, 'C-101', 2, 'Çift', TRUE,  1600.00, 'Boş'),
    (3, 1, 'C-102', 2, 'Çift', TRUE,  1600.00, 'Boş'),
    (3, 1, 'C-103', 4, 'Dörtlü', FALSE, 1100.00, 'Boş')
ON CONFLICT DO NOTHING;

-- 12.3 Öğrenci Profilleri
INSERT INTO student_profiles (user_id, student_number, phone, faculty, department, enrollment_year, class_year, address_city, gender) VALUES
    (23, '2024001', '05301234501', 'Mühendislik', 'Bilgisayar Müh.', 2024, 1, 'Antalya', 'Kadın'),
    (24, '2024002', '05301234502', 'Fen-Edebiyat', 'Matematik', 2024, 2, 'İstanbul', 'Erkek'),
    (25, '2024003', '05301234503', 'İktisadi İdari Bilimler', 'İşletme', 2024, 3, 'Ankara', 'Kadın'),
    (26, '2024004', '05301234504', 'Mühendislik', 'Elektrik Müh.', 2024, 1, 'İzmir', 'Erkek'),
    (27, '2024005', '05301234505', 'Hukuk', 'Hukuk', 2024, 2, 'Bursa', 'Kadın'),
    (8,  '2024006', '05301234506', 'Mühendislik', 'Makine Müh.', 2024, 3, 'Antalya', 'Erkek'),
    (10, '2024007', '05301234507', 'Fen-Edebiyat', 'Fizik', 2024, 2, 'İstanbul', 'Erkek'),
    (11, '2024008', '05301234508', 'İktisadi İdari Bilimler', 'Ekonomi', 2024, 1, 'Ankara', 'Erkek'),
    (18, '2024009', '05301234509', 'Mühendislik', 'İnşaat Müh.', 2024, 4, 'İzmir', 'Erkek')
ON CONFLICT (user_id) DO NOTHING;

-- 12.4 Oda Atamaları
INSERT INTO room_assignments (user_id, room_id, check_in_date, status, assigned_by) VALUES
    (23, 1, '2024-09-15', 'Aktif', 19),
    (24, 1, '2024-09-15', 'Aktif', 19),
    (25, 3, '2024-09-16', 'Aktif', 19),
    (26, 3, '2024-09-16', 'Aktif', 19),
    (27, 5, '2024-09-17', 'Aktif', 19);

-- Oda doluluk güncelle
UPDATE rooms SET current_occupancy = 2, status = 'Dolu'  WHERE id = 1;
UPDATE rooms SET current_occupancy = 2, status = 'Kısmi' WHERE id = 3;
UPDATE rooms SET current_occupancy = 1, status = 'Kısmi' WHERE id = 5;

-- 12.5 Giriş-Çıkış Kayıtları
INSERT INTO entry_exit_logs (user_id, log_type, logged_at, logged_by, gate) VALUES
    (23, 'Çıkış', NOW() - INTERVAL '3 hours', 20, 'Ana Giriş'),
    (23, 'Giriş', NOW() - INTERVAL '1 hour', 20, 'Ana Giriş'),
    (24, 'Çıkış', NOW() - INTERVAL '5 hours', 20, 'Ana Giriş'),
    (25, 'Giriş', NOW() - INTERVAL '2 hours', 20, 'Yan Kapı'),
    (26, 'Çıkış', NOW() - INTERVAL '4 hours', 20, 'Ana Giriş'),
    (26, 'Giriş', NOW() - INTERVAL '30 minutes', 20, 'Ana Giriş');

-- 12.6 Şikayetler
INSERT INTO complaints (user_id, room_id, category, title, description, priority, status) VALUES
    (23, 1, 'Arıza', 'Banyo musluğu damlıyor', 'Banyodaki lavabo musluğu sürekli damlıyor, gece uyuyamıyorum.', 'Yüksek', 'Beklemede'),
    (24, 1, 'Temizlik', 'Koridorun temizlenmesi', 'Koridorlar uzun süredir temizlenmedi.', 'Orta', 'İnceleniyor'),
    (25, 3, 'Arıza', 'Elektrik prizi çalışmıyor', 'Oda içindeki 2 numaralı priz tamamen çalışmıyor.', 'Yüksek', 'Beklemede'),
    (26, 3, 'Öneri', 'Çalışma odası talebi', 'Blokta bir çalışma odası olsa çok iyi olur.', 'Düşük', 'İnceleniyor'),
    (23, 1, 'Güvenlik', 'Kat kapısı kilidi bozuk', '2. kat kapısının kilidi çalışmıyor.', 'Acil', 'Beklemede');

-- 12.7 Duyurular
INSERT INTO announcements (title, content, category, created_by, target_role, is_pinned) VALUES
    ('Yurt Kuralları Güncellendi', 'Yeni dönem yurt kuralları güncellenmiştir. Tüm öğrencilerin okuması rica olunur. Giriş-çıkış saatleri 06:00-00:00 olarak belirlenmiştir.', 'Kural', 19, NULL, TRUE),
    ('Su Kesintisi — 15 Mart', 'Bakım çalışması nedeniyle 15 Mart Cumartesi günü 10:00-14:00 arası su kesintisi yaşanacaktır.', 'Bakım', 19, NULL, FALSE),
    ('Bahar Şenliği Kayıtları', 'Üniversite bahar şenliği kayıtları başlamıştır. Detaylı bilgi için öğrenci işlerine başvurun.', 'Etkinlik', 19, 'Öğrenci', FALSE);

-- 12.8 Bakım Kayıtları
INSERT INTO maintenance_logs (room_id, description, performed_by, maintenance_type, cost, status) VALUES
    (1, 'Musluk tamiri', 22, 'Tesisat', 150.00, 'Planlandı'),
    (2, 'Elektrik arızası giderimi', 22, 'Elektrik', 200.00, 'Devam Ediyor'),
    (3, 'Oda boyama', 22, 'Boya', 500.00, 'Tamamlandı');
UPDATE maintenance_logs SET completed_at = NOW() - INTERVAL '2 days' WHERE description = 'Oda boyama';

-- 12.9 Ödemeler
INSERT INTO payments (user_id, amount, payment_type, period_month, period_year, due_date, status) VALUES
    (23, 1500, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi'),
    (23, 1500, 'Yurt Ücreti', 4, 2026, '2026-04-15', 'Beklemede'),
    (24, 1500, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi'),
    (24, 1500, 'Yurt Ücreti', 4, 2026, '2026-04-15', 'Beklemede'),
    (25, 1000, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Gecikmiş'),
    (26, 1000, 'Yurt Ücreti', 3, 2026, '2026-03-15', 'Ödendi');
UPDATE payments SET paid_at = NOW() - INTERVAL '5 days' WHERE status = 'Ödendi';

-- 12.10 İzin Talepleri
INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, destination, status, approved_by) VALUES
    (23, 'Hafta Sonu', '2026-03-14', '2026-03-16', 'Ailemle buluşma', 'Antalya', 'Onaylandı', 19),
    (24, 'Sağlık', '2026-03-12', '2026-03-13', 'Doktor randevusu', 'Hastane', 'Beklemede', NULL),
    (25, 'Aile', '2026-03-20', '2026-03-23', 'Kardeşimin düğünü', 'İstanbul', 'Beklemede', NULL),
    (26, 'Tatil', '2026-03-28', '2026-04-05', 'Bahar tatili', 'Ankara', 'Reddedildi', 19);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 13: INDEX'LER                              ║
-- ╚══════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON room_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_room ON room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_entry_exit_user ON entry_exit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_exit_date ON entry_exit_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_visitors_student ON visitors(student_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_room ON maintenance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_user ON room_transfer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_room ON room_inventory(room_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);


-- ╔══════════════════════════════════════════════════════╗
-- ║  BÖLÜM 14: DOĞRULAMA                              ║
-- ╚══════════════════════════════════════════════════════╝

SELECT 
    t.table_name AS "Tablo",
    (xpath('/row/cnt/text()', xml_count))[1]::text::int AS "Kayıt Sayısı"
FROM information_schema.tables t
CROSS JOIN LATERAL (
    SELECT query_to_xml('SELECT COUNT(*) AS cnt FROM ' || t.table_name, false, true, '')
) AS x(xml_count)
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
