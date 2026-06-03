# Yurt Yönetim Sistemi

Üniversite yurdu için geliştirilmiş, web tabanlı tam kapsamlı yönetim sistemi. Öğrenci kayıtlarından oda atamasına, ödeme takibinden güvenlik loglarına kadar yurt işlemlerini tek platformda yönetir.

---

## Proje Amacı

Yurt yönetimi süreçlerini dijitalleştirmek; yönetici, öğrenci ve güvenlik personelinin işlerini kolaylaştırmak. Kağıt tabanlı işlemleri ortadan kaldırarak anlık raporlama ve bildirim imkânı sunar.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Backend | Node.js, Express.js |
| Veritabanı | PostgreSQL (Neon Cloud — Serverless) |
| Kimlik Doğrulama | JWT (JSON Web Token) + bcrypt |
| Email | Nodemailer (SMTP) |
| Zamanlayıcı | node-cron |
| Frontend | Vanilla HTML / CSS / JavaScript |

---

## Proje Yapısı

```
dormitory-management-system/
├── yurt-backend/               # Sunucu tarafı (Node.js/Express)
│   ├── index.js                # Uygulamanın giriş noktası, Express sunucusu
│   ├── .env.example            # Ortam değişkenleri şablonu (.env oluşturmak için kopyala)
│   ├── config/
│   │   ├── db.js               # PostgreSQL bağlantı havuzu (pool)
│   │   └── mail.js             # Nodemailer SMTP yapılandırması
│   ├── middleware/
│   │   ├── auth.js             # JWT doğrulama & rol tabanlı erişim kontrolü
│   │   ├── softDelete.js       # Soft-delete middleware
│   │   └── softDeleteReady.js  # Soft-delete hazırlık kontrolü
│   ├── jobs/
│   │   └── cleanupJob.js       # Zamanlanmış temizlik görevleri (cron)
│   ├── routes/
│   │   ├── authRoutes.js       # Giriş, şifre değiştirme
│   │   ├── adminRoutes.js      # Kullanıcı yönetimi (yönetici)
│   │   ├── userRoutes.js       # Profil işlemleri
│   │   ├── studentRoutes.js    # Öğrenci profili & oda atama
│   │   ├── roomRoutes.js       # Oda & bina yönetimi
│   │   ├── paymentRoutes.js    # Ödeme takibi
│   │   ├── complaintRoutes.js  # Şikayet bildirimleri
│   │   ├── announcementRoutes.js # Duyurular
│   │   ├── leaveRoutes.js      # İzin talep yönetimi
│   │   ├── visitorRoutes.js    # Ziyaretçi kayıtları
│   │   ├── entryExitRoutes.js  # Giriş-çıkış logları
│   │   ├── maintenanceRoutes.js # Bakım & onarım talepleri
│   │   ├── cleaningRoutes.js   # Temizlik görev takibi
│   │   ├── notificationRoutes.js # Bildirim sistemi
│   │   ├── reportRoutes.js     # Raporlar & istatistikler
│   │   └── mailRoutes.js       # Email doğrulama & şifre sıfırlama
│   └── migrations/             # Veritabanı şema dosyaları (SQL)
│       ├── 001_student_module.sql
│       ├── ...
│       └── 015_backfill_faculty_class_year.sql
│
└── yurt-frontend/              # İstemci tarafı (HTML/CSS/JS)
    ├── index.html              # Giriş (Login) sayfası
    ├── dashboard.html          # Ana gösterge paneli
    ├── admin-panel.html        # Yönetici paneli
    ├── student-panel.html      # Öğrenci paneli
    ├── cleaning-panel.html     # Temizlik personeli paneli
    ├── maintenance-panel.html  # Bakım personeli paneli
    ├── security-panel.html     # Güvenlik personeli paneli
    ├── dashboard.css           # Ortak stil dosyası
    └── dashboard.js            # Ortak JavaScript işlemleri
```

---

## Özellikler

- **Rol Tabanlı Erişim**: Admin, öğrenci, güvenlik, temizlik ve bakım personeli için ayrı paneller
- **Oda Yönetimi**: Bina/kat/oda yapısı, doluluk durumu, atama işlemleri
- **Öğrenci Yönetimi**: Kayıt, profil düzenleme, oda ataması, fakülte/bölüm bilgileri
- **Ödeme Takibi**: Yurt ücreti ödemelerinin kaydı ve takibi
- **İzin & Ziyaretçi**: İzin talepleri ve ziyaretçi giriş-çıkış kayıtları
- **Şikayet Sistemi**: Öğrencilerin şikayet oluşturması ve yönetimin takibi
- **Temizlik & Bakım**: Görev atama ve tamamlanma takibi
- **Duyurular & Bildirimler**: Tüm kullanıcılara anlık duyuru iletimi
- **Raporlama**: Doluluk, ödeme, şikayet istatistikleri
- **Email Sistemi**: Şifre sıfırlama ve bildirim emailları

---

## Kurulum

### Gereksinimler

- Node.js v18+
- PostgreSQL (veya Neon Cloud hesabı)

### Adımlar

```bash
# 1. Repoyu klonla
git clone https://github.com/yusufahmetklc/dormitory-management-system.git
cd dormitory-management-system/yurt-backend

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını açıp kendi veritabanı ve SMTP bilgilerinizi girin

# 4. Veritabanı şemalarını uygula (sırayla)
# migrations/ klasöründeki .sql dosyalarını veritabanınıza çalıştırın

# 5. Sunucuyu başlat
npm start
```

Sunucu varsayılan olarak `http://localhost:3000` adresinde çalışır.  
Frontend dosyaları `yurt-frontend/` klasöründe yer alır ve Express tarafından statik olarak sunulur.

---

## API Yapısı

Tüm API endpoint'leri `/api` prefix'i ile başlar. JWT korumalı endpoint'ler için `Authorization: Bearer <token>` header'ı gereklidir.

| Prefix | Modül |
|---|---|
| `/api/auth` | Kimlik doğrulama |
| `/api/admin` | Yönetici işlemleri |
| `/api/students` | Öğrenci yönetimi |
| `/api/rooms` | Oda yönetimi |
| `/api/payments` | Ödeme takibi |
| `/api/complaints` | Şikayet sistemi |
| `/api/announcements` | Duyurular |
| `/api/leave` | İzin talepleri |
| `/api/visitors` | Ziyaretçi kayıtları |
| `/api/entry-exit` | Giriş-çıkış logları |
| `/api/maintenance` | Bakım talepleri |
| `/api/cleaning` | Temizlik görevleri |
| `/api/notifications` | Bildirimler |
| `/api/reports` | Raporlar |
| `/api/mail` | Email işlemleri |

---

## Güvenlik

- Şifreler `bcrypt` ile hashlenerek saklanır
- Kimlik doğrulama `JWT` ile yapılır, token'lar sunucuda tutulmaz
- Veritabanı bilgileri `.env` dosyasında tutulur, asla kaynak koda yazılmaz
- `node_modules/` ve `.env` dosyaları `.gitignore` ile versiyon kontrolünden hariç tutulur

---

## Veritabanı

PostgreSQL kullanılmaktadır. Şema `belek_dormitory_module` / `belek_dormitory` namespace'leri altında organize edilmiştir. Tüm migration dosyaları `yurt-backend/migrations/` klasöründe SQL formatında bulunmaktadır.
