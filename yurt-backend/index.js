// ╔══════════════════════════════════════════════════════════════════════════╗
// ║             YURT YÖNETİM SİSTEMİ — ANA GİRİŞ NOKTASI (index.js)       ║
// ╠══════════════════════════════════════════════════════════════════════════╣
// ║  Bu dosya uygulamanın BAŞLANGIÇ NOKTASIDIR.                            ║
// ║  "node index.js" komutuyla çalıştırıldığında sunucu başlar.            ║
// ║                                                                         ║
// ║  GÖREVLERİ:                                                            ║
// ║  1. Express sunucusunu oluşturur (web framework)                       ║
// ║  2. Middleware'leri yükler (CORS, JSON parser)                         ║
// ║  3. Statik dosyaları sunar (frontend HTML/CSS/JS)                      ║
// ║  4. API route'larını bağlar (15 farklı modül)                         ║
// ║  5. Belirtilen portta dinlemeye başlar                                 ║
// ║                                                                         ║
// ║  PROJE YAPISI:                                                         ║
// ║  ┌─── yurt-backend/                                                    ║
// ║  │    ├── index.js          ← BU DOSYA (sunucu başlangıcı)           ║
// ║  │    ├── config/                                                      ║
// ║  │    │   ├── db.js         ← PostgreSQL bağlantısı                   ║
// ║  │    │   └── mail.js       ← Email ayarları (Nodemailer)             ║
// ║  │    ├── middleware/                                                   ║
// ║  │    │   └── auth.js       ← JWT token doğrulama & rol kontrolü      ║
// ║  │    └── routes/           ← Tüm API endpoint'leri (15 dosya)        ║
// ║  └─── yurt-frontend/                                                   ║
// ║       ├── index.html        ← Login sayfası                           ║
// ║       ├── admin-panel.html  ← Yönetici paneli                         ║
// ║       └── student-panel.html← Öğrenci paneli                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ──────────────────────────────────────────────
// 1. BAĞIMLILIKLAR (Dependencies)
// ──────────────────────────────────────────────
// Express → Web uygulaması framework'ü (HTTP sunucusu + routing)
// CORS → Cross-Origin Resource Sharing (farklı domain'lerden erişime izin verir)
// dotenv → .env dosyasından ortam değişkenlerini okur (DB şifreleri vb.)
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// ──────────────────────────────────────────────
// 2. ROUTE MODÜLLERİNİ İMPORT ET
// ──────────────────────────────────────────────
// Her route dosyası belirli bir işlev grubunun API endpoint'lerini içerir.
// Modüler yapı sayesinde kod düzenli ve bakımı kolay olur.
const authRoutes         = require("./routes/authRoutes");         // Login, şifre değiştirme
const adminRoutes        = require("./routes/adminRoutes");        // Admin: kullanıcı yönetimi
const userRoutes         = require("./routes/userRoutes");         // Profil bilgileri
const mailRoutes         = require("./routes/mailRoutes");         // Email doğrulama, şifre sıfırlama
const roomRoutes         = require("./routes/roomRoutes");         // Oda & bina yönetimi
const studentRoutes      = require("./routes/studentRoutes");      // Öğrenci profil & oda atama
const entryExitRoutes    = require("./routes/entryExitRoutes");    // Giriş-çıkış kayıtları
const complaintRoutes    = require("./routes/complaintRoutes");    // Şikayet bildirimleri
const announcementRoutes = require("./routes/announcementRoutes"); // Duyurular
const reportRoutes       = require("./routes/reportRoutes");       // Raporlar & istatistikler
const leaveRoutes        = require("./routes/leaveRoutes");        // İzin talep yönetimi
const visitorRoutes      = require("./routes/visitorRoutes");      // Ziyaretçi yönetimi
const paymentRoutes      = require("./routes/paymentRoutes");      // Ödeme takibi
const maintenanceRoutes  = require("./routes/maintenanceRoutes");  // Bakım & onarım
const notificationRoutes = require("./routes/notificationRoutes"); // Bildirimler

// ──────────────────────────────────────────────
// 3. EXPRESS UYGULAMASINI OLUŞTUR
// ──────────────────────────────────────────────
const app = express();

// ──────────────────────────────────────────────
// 4. MIDDLEWARE'LER — Her isteğe uygulanır
// ──────────────────────────────────────────────
// cors()          → Frontend farklı portta çalışsa bile API'ye erişebilir
// express.json()  → Gelen isteğin body'sini JSON olarak okur (req.body)
// urlencoded()    → Form verilerini okur (x-www-form-urlencoded)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global request logger
app.use((req, res, next) => {
  console.log(req.method, req.url, req.body);
  next();
});

// ──────────────────────────────────────────────
// 5. STATİK DOSYA SUNUMU (Frontend)
// ──────────────────────────────────────────────
// express.static() → Belirtilen klasördeki dosyaları doğrudan sunar.
// Tarayıcı http://localhost:3000/admin-panel.html istediğinde
// yurt-frontend/admin-panel.html dosyası döner.
//
// ÖNEMLİ: static middleware route'lardan ÖNCE tanımlanmalı.
// Aksi halde "/" root path route ile çakışır.
const path = require("path");
app.use(express.static(path.join(__dirname, "..", "yurt-frontend")));

// ──────────────────────────────────────────────
// 6. API ROUTE'LARINI BAĞLA
// ──────────────────────────────────────────────
// app.use(prefix, router) → İlk parametre URL ön eki, ikinci parametre router modülü.
// Örnek: app.use("/rooms", roomRoutes) → roomRoutes içindeki "/" aslında "/rooms" olur.
//
// ┌──────────────────┬──────────────────────────────────────────────────────┐
// │ URL Prefix       │ Endpoint'ler                                        │
// ├──────────────────┼──────────────────────────────────────────────────────┤
// │ /                │ /login, /login-test, /change-password               │
// │ /                │ /profile, /students                                 │
// │ /admin           │ /admin/users, /admin/users/:id/role                 │
// │ /rooms           │ /rooms, /rooms/buildings, /rooms/:id                │
// │ /students        │ /students/profile, /students/list                   │
// │ /entry-exit      │ /entry-exit, /entry-exit/my                         │
// │ /complaints      │ /complaints, /complaints/:id/status                 │
// │ /announcements   │ /announcements                                      │
// │ /reports         │ /reports/dashboard, /reports/occupancy               │
// │ /leaves          │ /leaves, /leaves/my, /leaves/:id                    │
// │ /visitors        │ /visitors, /visitors/my                             │
// │ /payments        │ /payments, /payments/my, /payments/stats            │
// │ /maintenance     │ /maintenance, /maintenance/:id/status               │
// │ /notifications   │ /notifications/my, /notifications/unread-count      │
// └──────────────────┴──────────────────────────────────────────────────────┘
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", mailRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/entry-exit", entryExitRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/visitors", visitorRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/notifications", notificationRoutes);

// ──────────────────────────────────────────────
// 7. SUNUCUYU BAŞLAT
// ──────────────────────────────────────────────
// APP_HOST: "0.0.0.0" → Tüm ağ arayüzlerinden erişilebilir
// PORT: 3000 → Varsayılan port (.env ile değiştirilebilir)
//
// Tarayıcıda http://localhost:3000 adresinden erişilir.
// Global error handler (catches express.json() parse errors and unhandled throws)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: "Geçersiz JSON formatı" });
  }
  console.error("Sunucu hatası:", err.message || err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Sunucu hatası" });
});

const APP_HOST = process.env.APP_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, APP_HOST, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});

