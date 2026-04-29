// ╔══════════════════════════════════════════════════════════════════╗
// ║  GİRİŞ-ÇIKIŞ KAYITLARI ROUTE'LARI (entryExitRoutes.js)        ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Güvenlik görevlileri ve yöneticiler tarafından kullanılır.    ║
// ║  Öğrencilerin yurda giriş-çıkış saatlerini kaydeder.         ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /entry-exit        → Tüm giriş-çıkış kayıtları         ║
// ║  POST /entry-exit        → Yeni giriş/çıkış kaydı oluştur    ║
// ║  GET  /entry-exit/my     → Öğrencinin kendi kayıtları         ║
// ║  GET  /entry-exit/search → Kayıt arama                        ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /entry-exit
// Yeni giriş/çıkış kaydı oluşturur (Güvenlik veya Yönetici)
// Body: { user_id, log_type: "Giriş"|"Çıkış", gate, notes }
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    return res.json({ success: true, data: [] });
  }
);

// ------------------------------------
// GET /entry-exit
// Giriş-çıkış kayıtlarını listeler (filtreleme destekli)
// Query: ?user_id=23&type=Giriş&date=2024-03-10&limit=50
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    return res.json({ success: true, data: [] });
  }
);

// ------------------------------------
// GET /entry-exit/my
// Kendi giriş-çıkış geçmişini görür (Öğrenci)
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  return res.json({ success: true, data: [] });
});

// ------------------------------------
// GET /entry-exit/search
// Öğrenci arama (giriş-çıkış kaydı için — Güvenlik)
// Query: ?q=Ali veya ?q=ogrenci1@yurt.com veya ?q=2024001
// ------------------------------------
router.get("/search",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    return res.json({ success: true, data: [] });
  }
);

// ------------------------------------
// GET /entry-exit/today-stats
// Günlük giriş-çıkış istatistikleri
// ------------------------------------
router.get("/today-stats",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    return res.json({ success: true, data: [] });
  }
);

module.exports = router;
