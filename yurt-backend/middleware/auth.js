// ╔══════════════════════════════════════════════════════════════════╗
// ║  KİMLİK DOĞRULAMA MİDDLEWARE'LERİ (middleware/auth.js)        ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Bu dosya iki önemli middleware fonksiyonu içerir:               ║
// ║                                                                  ║
// ║  1) authenticateToken → JWT token doğrulama                     ║
// ║     Her korumalı endpoint'ten önce çalışır.                     ║
// ║     Token geçerliyse → req.user'a kullanıcı bilgisini yazar.   ║
// ║     Token yoksa/geçersizse → 401/403 hata döner.               ║
// ║                                                                  ║
// ║  2) authorizeRole → Rol bazlı yetkilendirme                    ║
// ║     Belirli rollere sahip kullanıcılara erişim izni verir.     ║
// ║     Örnek: authorizeRole("Yönetici","Admin") → sadece bu       ║
// ║     rollerdeki kullanıcılar erişebilir.                         ║
// ║                                                                  ║
// ║  MIDDLEWARE NEDİR?                                               ║
// ║  İstek (request) ile yanıt (response) arasında çalışan         ║
// ║  fonksiyonlardır. Bir nevi "güvenlik kapısı" görevi görür.     ║
// ║  next() çağrılırsa → bir sonraki middleware/route'a geçer.     ║
// ║  res.status().json() → İsteği burada keser, yanıt döner.      ║
// ╚══════════════════════════════════════════════════════════════════╝

const jwt = require("jsonwebtoken");     // JWT token oluşturma ve doğrulama kütüphanesi
require("dotenv").config();

// JWT gizli anahtarı — token'ları imzalamak ve doğrulamak için kullanılır.
// ÖNEMLİ: Gerçek projede bu .env dosyasında tutulmalıdır!
const JWT_SECRET = process.env.JWT_SECRET || "gizliAnahtar";

// ──────────────────────────────────────────────
// 1. authenticateToken — JWT Token Doğrulama
// ──────────────────────────────────────────────
// İstek akışı: İstek → authenticateToken → Route handler
//
// Kontrol adımları:
// 1. Authorization header'ını oku → "Bearer eyJhbGciOi..."
// 2. "Bearer " kısmını ayır, sadece token'ı al
// 3. jwt.verify() ile token'ı doğrula
// 4. Geçerliyse → req.user = { id, user_type } olarak ekle
// 5. next() ile bir sonraki fonksiyona geç
function authenticateToken(req, res, next) {
  // Authorization header'ını al
  const authHeader = req.headers["authorization"];
  // "Bearer eyJhbGciOi..." → split(" ")[1] → sadece token kısmı
  const token = authHeader && authHeader.split(" ")[1];

  // Token yoksa → 401 Unauthorized
  if (!token) {
    return res.status(401).json({ message: "Token gerekli" });
  }

  // Token'ı doğrula — gizli anahtarla imza kontrolü yapar
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Token geçersiz veya süresi dolmuş → 403 Forbidden
      return res.status(403).json({ message: "Geçersiz token" });
    }
    // Token geçerli → payload'ı (id, user_type) req.user'a yaz
    // Sonraki route handler'da req.user.id ile kullanıcı ID'sine erişilir
    req.user = user;
    next(); // Bir sonraki middleware/route'a geç
  });
}

// ──────────────────────────────────────────────
// 2. authorizeRole — Rol Bazlı Yetkilendirme
// ──────────────────────────────────────────────
// Kullanım örneği:
//   router.get("/admin/users", authenticateToken, authorizeRole("Admin","SuperAdmin"), handler)
//
// Bu durumda:
// 1. authenticateToken → token doğrulama (req.user.user_type = "Admin")
// 2. authorizeRole("Admin","SuperAdmin") → "Admin" listede var mı? EVET → geç
// 3. handler → asıl iş mantığı çalışır
//
// Eğer kullanıcı "Öğrenci" ise ve sadece "Admin" izinliyse → 403 döner
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    // req.user.user_type → authenticateToken'dan gelen kullanıcı rolü
    if (!allowedRoles.includes(req.user.user_type)) {
      return res.status(403).json({ message: "Yetkiniz yok" });
    }
    next(); // Yetkili → devam et
  };
}

// Fonksiyonları ve sabit değeri dışa aktar
// Diğer dosyalarda: const { authenticateToken, authorizeRole } = require('./middleware/auth');
module.exports = { authenticateToken, authorizeRole, JWT_SECRET };
