// ╔══════════════════════════════════════════════════════════════════╗
// ║  ZİYARETÇİ YÖNETİMİ ROUTE'LARI (routes/visitorRoutes.js)     ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Güvenlik görevlileri tarafından kullanılır.                   ║
// ║  Öğrencilere gelen ziyaretçilerin giriş-çıkışını takip eder. ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /visitors             → Tüm ziyaretçileri listele       ║
// ║  POST /visitors             → Ziyaretçi girişi kaydet         ║
// ║  GET  /visitors/my          → Öğrencinin ziyaretçileri        ║
// ║  PUT  /visitors/:id/checkout→ Ziyaretçi çıkışı kaydet          ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /visitors
// Yeni ziyaretçi kaydı oluşturur (Güvenlik/Yönetici)
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { visitor_name, visitor_tc, visitor_phone, host_name } = req.body || {};

    if (!visitor_name) {
      return res.status(400).json({ success: false, message: "Ziyaretçi adı zorunlu" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO belek_dormitory_module.visitors (visitor_name, visitor_tc, visitor_phone, host_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [visitor_name, visitor_tc || null, visitor_phone || null, host_name || null]
      );

      console.log("Visitor saved");
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Ziyaretçi kayıt hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /visitors/:id/checkout
// Ziyaretçi çıkış kaydı (Güvenlik/Yönetici)
// ------------------------------------
router.patch("/:id/checkout",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE belek_dormitory_module.visitors SET check_out_time = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Ziyaretçi çıkış hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /visitors
// Ziyaretçi kayıtlarını listeler (Güvenlik/Yönetici)
// Query: ?student_id=23&date=2026-03-10&active_only=true
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { date, active_only } = req.query;
      let query = `SELECT id, visitor_name, visitor_tc, visitor_phone, host_name, created_at
                   FROM belek_dormitory_module.visitors
                   WHERE 1=1`;
      const params = [];
      let idx = 1;

      if (date) { query += ` AND DATE(created_at) = $${idx++}`; params.push(date); }
      if (active_only === 'true') { query += ` AND check_out_time IS NULL`; }

      query += " ORDER BY created_at DESC";

      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Ziyaretçi listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /visitors/my
// Öğrencinin kendi ziyaretçi geçmişi
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  return res.json({ success: true, data: [] });
});

// ------------------------------------
// GET /visitors/today-stats
// Günlük ziyaretçi istatistikleri
// ------------------------------------
router.get("/today-stats",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_total,
          COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND check_out_time IS NULL) AS currently_inside,
          COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE AND check_out_time IS NOT NULL) AS checked_out
        FROM belek_dormitory_module.visitors
      `);
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Ziyaretçi istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
