-- ============================================================
-- YURT YÖNETİM SİSTEMİ — GELİŞMİŞ ÖĞRENCİ MODÜLÜ v2
-- PostgreSQL (Neon) için hazırlanmıştır
-- Bu dosyayı 001_student_module.sql çalıştırdıktan sonra
-- veritabanı admin hesabıyla çalıştırın (Neon SQL Editor)
-- ============================================================
-- Tarih: 2026-03-10
-- İçerik:
--   1. İzin Talepleri (leave_requests)
--   2. Oda Transfer Talepleri (room_transfer_requests)
--   3. Öğrenci Belgeleri (student_documents)
--   4. Disiplin Kayıtları (student_warnings)
--   5. Oda Envanter Takibi (room_inventory)
--   6. Bildirim Kayıtları (notification_logs)
--   7. Sistem Denetim Kaydı (audit_logs)
-- ============================================================

-- ╔══════════════════════════════════════════════════════╗
-- ║  1. İZİN TALEPLERİ (leave_requests)                  ║
-- ║  Öğrencilerin yurttan ayrılma izni talepleri         ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS leave_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type      VARCHAR(30) NOT NULL CHECK (leave_type IN ('Hafta Sonu', 'Tatil', 'Sağlık', 'Aile', 'Resmi', 'Diğer')),
    start_date      DATE NOT NULL,                          -- İzin başlangıç tarihi
    end_date        DATE NOT NULL,                          -- İzin bitiş tarihi
    reason          TEXT NOT NULL,                           -- İzin sebebi
    destination     VARCHAR(200),                            -- Gideceği yer
    guardian_approval BOOLEAN DEFAULT FALSE,                 -- Veli onayı (18 yaş altı için)
    status          VARCHAR(20) CHECK (status IN ('Beklemede', 'Onaylandı', 'Reddedildi', 'İptal', 'Dönüş Yapıldı')) DEFAULT 'Beklemede',
    approved_by     INTEGER REFERENCES users(id),           -- Onaylayan yönetici
    approved_at     TIMESTAMPTZ,                            -- Onay tarihi
    return_date     TIMESTAMPTZ,                            -- Gerçek dönüş tarihi
    rejection_reason TEXT,                                   -- Ret gerekçesi
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

COMMENT ON TABLE leave_requests IS 'Öğrenci izin talepleri — hafta sonu, tatil, sağlık vb. izin yönetimi';

CREATE INDEX IF NOT EXISTS idx_leave_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_requests(start_date, end_date);

-- ╔══════════════════════════════════════════════════════╗
-- ║  2. ODA TRANSFER TALEPLERİ (room_transfer_requests)  ║
-- ║  Öğrencilerin oda değişikliği talepleri              ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS room_transfer_requests (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_room_id INTEGER REFERENCES rooms(id),           -- Mevcut oda
    requested_room_id INTEGER REFERENCES rooms(id),         -- Talep edilen oda (NULL = herhangi bir oda)
    reason          TEXT NOT NULL,                           -- Transfer sebebi
    priority        VARCHAR(10) CHECK (priority IN ('Düşük', 'Orta', 'Yüksek', 'Acil')) DEFAULT 'Orta',
    status          VARCHAR(20) CHECK (status IN ('Beklemede', 'Onaylandı', 'Reddedildi', 'Tamamlandı', 'İptal')) DEFAULT 'Beklemede',
    approved_by     INTEGER REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    rejection_reason TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE room_transfer_requests IS 'Oda değişikliği talepleri — öğrenci talebini oluşturur, yönetici onaylar';

CREATE INDEX IF NOT EXISTS idx_transfer_user ON room_transfer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_status ON room_transfer_requests(status);

-- ╔══════════════════════════════════════════════════════╗
-- ║  3. ÖĞRENCİ BELGELERİ (student_documents)           ║
-- ║  Öğrencilerin yüklediği belgeler                     ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS student_documents (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type   VARCHAR(50) NOT NULL CHECK (document_type IN (
        'Kimlik Fotokopisi', 'Öğrenci Belgesi', 'Sağlık Raporu',
        'Burs Belgesi', 'İkametgah', 'Vesikalık Fotoğraf',
        'Veli İzin Belgesi', 'Diğer'
    )),
    file_name       VARCHAR(255) NOT NULL,                  -- Dosya adı
    file_url        VARCHAR(500),                           -- Dosya URL/yolu
    file_size       INTEGER,                                -- Dosya boyutu (byte)
    mime_type       VARCHAR(100),                           -- Dosya MIME tipi
    status          VARCHAR(20) CHECK (status IN ('Yüklendi', 'Onaylandı', 'Reddedildi', 'Süresi Doldu')) DEFAULT 'Yüklendi',
    verified_by     INTEGER REFERENCES users(id),           -- Doğrulayan yönetici
    verified_at     TIMESTAMPTZ,
    expiry_date     DATE,                                   -- Belge geçerlilik tarihi
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE student_documents IS 'Öğrenci belgeleri — kimlik, sağlık raporu, öğrenci belgesi vb.';

CREATE INDEX IF NOT EXISTS idx_documents_user ON student_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON student_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON student_documents(status);

-- ╔══════════════════════════════════════════════════════╗
-- ║  4. DİSİPLİN KAYITLARI (student_warnings)           ║
-- ║  Öğrenci uyarı ve disiplin işlemleri                 ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS student_warnings (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warning_type    VARCHAR(30) NOT NULL CHECK (warning_type IN (
        'Sözlü Uyarı', 'Yazılı Uyarı', 'Kınama',
        'Geçici Uzaklaştırma', 'Kalıcı Uzaklaştırma'
    )),
    reason          TEXT NOT NULL,                           -- Uyarı sebebi
    description     TEXT,                                    -- Detaylı açıklama
    severity        VARCHAR(10) CHECK (severity IN ('Hafif', 'Orta', 'Ağır', 'Çok Ağır')) DEFAULT 'Orta',
    issued_by       INTEGER NOT NULL REFERENCES users(id),  -- Uyarıyı veren yönetici
    incident_date   DATE DEFAULT CURRENT_DATE,              -- Olay tarihi
    appeal_status   VARCHAR(20) CHECK (appeal_status IN ('Yok', 'İtiraz Edildi', 'İtiraz Kabul', 'İtiraz Red')) DEFAULT 'Yok',
    appeal_notes    TEXT,                                    -- İtiraz açıklaması
    is_active       BOOLEAN DEFAULT TRUE,                   -- Aktif mi (affedildi mi?)
    expires_at      DATE,                                   -- Süre bitimi (geçici uzaklaştırma için)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE student_warnings IS 'Disiplin işlemleri — sözlü uyarıdan uzaklaştırmaya kadar kademeli sistem';

CREATE INDEX IF NOT EXISTS idx_warnings_user ON student_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_warnings_type ON student_warnings(warning_type);
CREATE INDEX IF NOT EXISTS idx_warnings_active ON student_warnings(is_active);

-- ╔══════════════════════════════════════════════════════╗
-- ║  5. ODA ENVANTERİ (room_inventory)                   ║
-- ║  Odalardaki demirbaş ve eşya takibi                  ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS room_inventory (
    id              SERIAL PRIMARY KEY,
    room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    item_name       VARCHAR(100) NOT NULL,                  -- Eşya adı (Yatak, Dolap, Masa vb.)
    item_code       VARCHAR(50),                            -- Demirbaş numarası
    quantity        INTEGER NOT NULL DEFAULT 1,
    condition       VARCHAR(20) CHECK (condition IN ('Yeni', 'İyi', 'Orta', 'Kötü', 'Kullanılamaz')) DEFAULT 'İyi',
    purchase_date   DATE,
    last_check_date DATE,                                   -- Son kontrol tarihi
    checked_by      INTEGER REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE room_inventory IS 'Oda demirbaş takibi — eşya durumu ve kontrol geçmişi';

CREATE INDEX IF NOT EXISTS idx_inventory_room ON room_inventory(room_id);
CREATE INDEX IF NOT EXISTS idx_inventory_condition ON room_inventory(condition);

-- ╔══════════════════════════════════════════════════════╗
-- ║  6. BİLDİRİM KAYITLARI (notification_logs)          ║
-- ║  Kullanıcılara gönderilen sistem bildirimleri        ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS notification_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    notification_type VARCHAR(30) CHECK (notification_type IN (
        'Bilgi', 'Uyarı', 'Acil', 'Oda', 'Şikayet', 'Ödeme', 'İzin', 'Sistem'
    )) DEFAULT 'Bilgi',
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    related_type    VARCHAR(50),                            -- İlgili kayıt tipi (complaint, payment, vb.)
    related_id      INTEGER,                                -- İlgili kayıt ID
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE notification_logs IS 'Kullanıcı bildirimleri — sistem olaylarına bağlı otomatik bildirimler';

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notification_logs(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notification_logs(notification_type);

-- ╔══════════════════════════════════════════════════════╗
-- ║  7. SİSTEM DENETİM KAYDI (audit_logs)                ║
-- ║  Tüm kritik işlemlerin kaydı                         ║
-- ╚══════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id),           -- İşlemi yapan kullanıcı
    action          VARCHAR(50) NOT NULL,                    -- İşlem tipi (CREATE, UPDATE, DELETE, LOGIN vb.)
    entity_type     VARCHAR(50) NOT NULL,                    -- Tablo/varlık adı
    entity_id       INTEGER,                                -- İlgili kayıt ID
    old_values      JSONB,                                  -- Eski değerler (UPDATE/DELETE için)
    new_values      JSONB,                                  -- Yeni değerler (CREATE/UPDATE için)
    ip_address      VARCHAR(45),                            -- İstemci IP adresi
    user_agent      VARCHAR(500),                           -- Tarayıcı bilgisi
    description     TEXT,                                   -- İşlem açıklaması
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Sistem denetim kaydı — tüm kritik işlemlerin izlenebilirliği';

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);

-- ============================================================
-- YETKİLENDİRME — belek05 kullanıcısına tüm yeni tablolarda
-- SELECT, INSERT, UPDATE, DELETE izinleri ver
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_transfer_requests TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_documents TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_warnings TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE room_inventory TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_logs TO belek05;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO belek05;

-- Sequence izinleri
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO belek05;

-- ============================================================
-- ÖRNEK VERİ — Test amaçlı başlangıç verileri
-- ============================================================

-- Oda envanter örnekleri (A-101 için)
INSERT INTO room_inventory (room_id, item_name, item_code, quantity, condition) VALUES
    (1, 'Tek Kişilik Yatak', 'DMB-001', 2, 'İyi'),
    (1, 'Çalışma Masası', 'DMB-002', 2, 'İyi'),
    (1, 'Sandalye', 'DMB-003', 2, 'Yeni'),
    (1, 'Gardırop', 'DMB-004', 2, 'İyi'),
    (1, 'Kitaplık', 'DMB-005', 1, 'İyi'),
    (1, 'Çöp Kovası', 'DMB-006', 1, 'Yeni')
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLO ÖZETİ (Tüm modül — 001 + 002 birlikte)
-- ============================================================
-- ┌────┬─────────────────────────┬──────────────────────────────────┐
-- │  # │ Tablo Adı               │ Açıklama                         │
-- ├────┼─────────────────────────┼──────────────────────────────────┤
-- │  1 │ users                   │ Ana kullanıcı tablosu (mevcut)   │
-- │  2 │ buildings               │ Yurt binaları                    │
-- │  3 │ rooms                   │ Yurt odaları                     │
-- │  4 │ student_profiles        │ Öğrenci kimlik/iletişim bilgisi  │
-- │  5 │ room_assignments        │ Oda atamaları & konaklama geçmişi│
-- │  6 │ entry_exit_logs         │ Yurda giriş-çıkış kayıtları     │
-- │  7 │ complaints              │ Şikayet & arıza bildirimleri     │
-- │  8 │ announcements           │ Yönetim duyuruları               │
-- │  9 │ maintenance_logs        │ Bakım/onarım kayıtları           │
-- │ 10 │ payments                │ Ödeme kayıtları                  │
-- │ 11 │ visitors                │ Ziyaretçi kayıtları              │
-- │ 12 │ leave_requests          │ İzin talepleri                   │
-- │ 13 │ room_transfer_requests  │ Oda transfer talepleri           │
-- │ 14 │ student_documents       │ Öğrenci belgeleri                │
-- │ 15 │ student_warnings        │ Disiplin kayıtları               │
-- │ 16 │ room_inventory          │ Oda envanter takibi              │
-- │ 17 │ notification_logs       │ Bildirim kayıtları               │
-- │ 18 │ audit_logs              │ Sistem denetim kaydı             │
-- └────┴─────────────────────────┴──────────────────────────────────┘
