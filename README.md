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

## Kurulum ve Çalıştırma

### Gereksinimler

- [Node.js](https://nodejs.org/) v18 veya üzeri
- PostgreSQL veritabanı (yerel kurulum **ya da** [Neon Cloud](https://neon.tech) ücretsiz hesabı)
- Git

---

### 1. Repoyu Klonla

```bash
git clone https://github.com/yusufahmetklc/dormitory-management-system.git
cd dormitory-management-system
```

---

### 2. Bağımlılıkları Yükle

```bash
cd yurt-backend
npm install
```

---

### 3. Ortam Değişkenlerini Ayarla

`yurt-backend/` klasörü içinde `.env.example` dosyasını kopyalayarak `.env` oluşturun:

```bash
# Windows (PowerShell)
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Ardından `.env` dosyasını bir metin editörüyle açıp aşağıdaki alanları doldurun:

```env
DB_HOST=<veritabanı sunucu adresi>
DB_PORT=5432
DB_USER=<veritabanı kullanıcı adı>
DB_PASSWORD=<veritabanı şifresi>
DB_NAME=<veritabanı adı>

JWT_SECRET=<rastgele uzun bir gizli anahtar>

SMTP_HOST=<smtp sunucu adresi>
SMTP_PORT=2525
SMTP_USER=<smtp kullanıcı adı>
SMTP_PASS=<smtp şifresi>

PORT=3000
APP_HOST=0.0.0.0
APP_BASE_URL=http://localhost:3000
```

> **Not:** `.env` dosyası `.gitignore`'a eklenmiştir ve asla GitHub'a gönderilmez.

---

### 4. Veritabanı Şemalarını Uygula

`yurt-backend/migrations/` klasöründeki SQL dosyalarını **sırayla** veritabanınıza uygulayın:

```bash
# psql ile (yerel PostgreSQL)
psql -U <kullanıcı_adı> -d <veritabanı_adı> -f migrations/001_student_module.sql
psql -U <kullanıcı_adı> -d <veritabanı_adı> -f migrations/002_enhanced_student_module.sql
# ... 015'e kadar tüm dosyaları sırayla çalıştırın
```

Neon Cloud kullanıyorsanız SQL içeriklerini Neon'un web arayüzündeki **SQL Editor**'a yapıştırarak çalıştırabilirsiniz.

---

### 5. Sunucuyu Başlat

```bash
# yurt-backend/ klasöründeyken:
npm start
```

Sunucu başarıyla çalışırsa terminalde şu mesajı görürsünüz:

```
Server running on http://localhost:3000
```

---

### 6. Uygulamaya Eriş

Tarayıcınızda aşağıdaki adresi açın:

```
http://localhost:3000
```

Giriş sayfası (`index.html`) açılacaktır. Rol seçerek sisteme giriş yapabilirsiniz:

| Rol | Panel |
|---|---|
| Yönetici (Admin) | `/admin-panel.html` |
| Öğrenci | `/student-panel.html` |
| Temizlik Personeli | `/cleaning-panel.html` |
| Bakım Personeli | `/maintenance-panel.html` |
| Güvenlik | `/security-panel.html` |

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
