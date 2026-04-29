// ╔══════════════════════════════════════════════════════════════════╗
// ║  KİMLİK DOĞRULAMA ROUTE'LARI (routes/authRoutes.js)            ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Bu dosya kullanıcı giriş ve şifre işlemlerini yönetir.        ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  ┌───────────────────────┬─────────────────────────────────────┐║
// ║  │ POST /login           │ Email + şifre ile giriş yapar      │║
// ║  │ GET  /login-test      │ Test amaçlı sabit token üretir     │║
// ║  │ POST /change-password │ Mevcut şifreyi değiştirir          │║
// ║  └───────────────────────┴─────────────────────────────────────┘║
// ║                                                                  ║
// ║  GİRİŞ AKIŞI:                                                  ║
// ║  1. Kullanıcı email + şifre girer                              ║
// ║  2. Email ile veritabanında kullanıcı aranır                   ║
// ║  3. Email doğrulanmış mı? Hesap aktif mi? kontrol edilir       ║
// ║  4. bcrypt ile şifre hash'i karşılaştırılır                    ║
// ║  5. Başarılıysa JWT token üretilir (1 saat geçerli)           ║
// ║  6. Token + user_type frontend'e döner                         ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const bcrypt = require("bcrypt");    // Şifre hash'leme kütüphanesi (güvenli saklama)
const jwt = require("jsonwebtoken"); // JSON Web Token — kimlik doğrulama token'ı
const pool = require("../config/db"); // PostgreSQL bağlantı havuzu
const { authenticateToken, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /login
// Kullanıcı girişi — email ve şifre ile doğrulama yapar
// Başarılıysa JWT token döner
// ------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  try {
    // Kullanıcıyı email ile bul
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    const user = result.rows[0];

    // Email doğrulama kontrolü devre dışı — tüm kullanıcılar giriş yapabilir

    // Hesap aktif mi kontrol et
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Hesap aktif değil. Yöneticiye başvurun." });
    }

    // Şifre doğrulama (bcrypt ile hash karşılaştırması)
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Şifre yanlış" });
    }

    // JWT token üret (7 gün geçerli)
    const token = jwt.sign(
      { id: user.id, user_type: user.user_type },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Giriş başarılı",
      token,
      user_type: user.user_type,
    });
  } catch (err) {
    console.error("Login hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /login-test
// Test amaçlı sabit bir JWT token üretir
// ------------------------------------
router.get("/login-test", (req, res) => {
  const token = jwt.sign(
    { id: 1, user_type: "Öğrenci" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

// ------------------------------------
// POST /change-password
// Oturum açmış kullanıcının şifresini değiştirir
// Şifre politikası: min 8 kar, büyük/küçük harf, rakam, özel karakter
// ------------------------------------
router.post("/change-password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  try {
    // Kullanıcıyı ID ile bul
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    const user = result.rows[0];

    // Hesap aktif mi kontrol et
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Hesap aktif değil." });
    }

    // Mevcut şifre doğru mu kontrol et
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Mevcut şifre yanlış" });
    }

    // Şifre politikası kontrolü (en az 8 karakter, büyük/küçük harf, rakam, özel karakter)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Şifre en az 8 karakter, büyük/küçük harf, rakam ve özel karakter içermelidir",
      });
    }

    // Yeni şifreyi hashle ve güncelle
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, update_date = NOW(),
        password_changed_by = 'self', password_changed_at = NOW() WHERE id = $2`,
      [newHash, user.id]
    );

    res.json({ success: true, message: "Şifre başarıyla değiştirildi" });
  } catch (err) {
    console.error("Şifre değiştirme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

module.exports = router;
