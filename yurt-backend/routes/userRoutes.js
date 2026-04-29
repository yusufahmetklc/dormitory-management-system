// ╔══════════════════════════════════════════════════════════════════╗
// ║  KULLANICI ROUTE'LARI (routes/userRoutes.js)                    ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Bu dosya kullanıcı profil bilgi endpoint'lerini içerir.        ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET /profile   → Giriş yapan kullanıcının temel bilgilerini    ║
// ║                   döner (id, email, user_type, ad, soyad).      ║
// ║                   TÜM roller için çalışır.                      ║
// ║  GET /students  → Öğrenci tablosundaki tüm kayıtları listeler  ║
// ║                   (Admin panelinde kullanılır)                  ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// GET /profile
// Oturum açmış kullanıcının profil bilgilerini döner
// Token içindeki id ile veritabanından kullanıcıyı getirir
// ------------------------------------
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, user_type, first_name, last_name, username FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Profil hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /students
// Tüm öğrenci kayıtlarını listeler (ogrenci tablosu)
// ------------------------------------
router.get("/students", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ogrenci");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Öğrenci listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Veritabanı hatası" });
  }
});

module.exports = router;
