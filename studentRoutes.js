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
    const { student_user_id, visitor_name, visitor_tc, tc_number, visitor_phone, phone: visPhone, relation, notes, host_name } = req.body || {};
    const tc = visitor_tc || tc_number || null;
    const phone = visitor_phone || visPhone || null;

    console.log('[POST /visitors] user:', req.user.id, 'body:', JSON.stringify(req.body));

    if (!visitor_name) {
      return res.status(400).json({ success: false, message: "Ziyaretçi adı zorunlu" });
    }

    try {
      let resolvedStudentId = student_user_id ? parseInt(student_user_id) : null;

      // student_user_id yoksa host_name ile öğrenci ara
      if (!resolvedStudentId && host_name) {
        const found = await pool.query(
          "SELECT id, first_name, last_name FROM users WHERE user_type = 'Öğrenci' AND (first_name || ' ' || last_name) ILIKE $1 LIMIT 1",
          [`%${host_name.trim()}%`]
        );
        if (found.rows.length > 0) resolvedStudentId = found.rows[0].id;
      }

      if (!resolvedStudentId) {
        return res.status(400).json({ success: false, message: "Ziyaret edilen öğrenci bulunamadı. Ad Soyad bilgisini doğru girin." });
      }

      // Öğrenci kontrolü
      const student = await pool.query(
        "SELECT id, first_name, last_name FROM users WHERE id = $1", [resolvedStudentId]
      );
      if (student.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Öğrenci bulunamadı" });
      }

      const result = await pool.query(
        `INSERT INTO visitors (student_user_id, visitor_name, visitor_tc, visitor_phone, relation, logged_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [resolvedStudentId, visitor_name, tc, phone, relation, req.user.id, notes]
      );

      console.log('[POST /visitors] created id:', result.rows[0]?.id, 'for student:', resolvedStudentId);
      res.status(201).json({
        success: true,
        message: `${visitor_name} → ${student.rows[0].first_name} ${student.rows[0].last_name} ziyaretçi kaydı oluşturuldu`,
        data: result.rows[0]
      });
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
      const visitor = await pool.query(
        "SELECT * FROM visitors WHERE id = $1 AND check_out_time IS NULL",
        [req.params.id]
      );

      if (visitor.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Aktif ziyaretçi kaydı bulunamadı" });
      }

      await pool.query(
        "UPDATE visitors SET check_out_time = NOW() WHERE id = $1",
        [req.params.id]
      );

      res.json({ success: true, message: "Ziyaretçi çıkış kaydı yapıldı" });
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
      const { student_id, date, active_only, search } = req.query;
      let query = `
        SELECT v.*,
               u.first_name AS student_first, u.last_name AS student_last, u.email AS student_email,
               sp.student_number, sp.phone AS student_phone,
               r.room_number, b.name AS building_name,
               g.first_name AS guard_first, g.last_name AS guard_last
        FROM visitors v
        JOIN users u ON v.student_user_id = u.id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN room_assignments ra ON ra.user_id = u.id AND ra.status = 'Aktif'
        LEFT JOIN rooms r ON ra.room_id = r.id
        LEFT JOIN buildings b ON r.building_id = b.id
        LEFT JOIN users g ON v.logged_by = g.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      if (student_id) {
        query += ` AND v.student_user_id = $${idx++}`;
        params.push(student_id);
      }
      if (date) {
        query += ` AND DATE(v.check_in_time) = $${idx++}`;
        params.push(date);
      }
      if (active_only === 'true') {
        query += " AND v.check_out_time IS NULL";
      }
      if (search) {
        query += ` AND (v.visitor_name ILIKE $${idx} OR v.visitor_tc ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
      }

      query += " ORDER BY v.check_in_time DESC LIMIT 100";

      const result = await pool.query(query, params);
      console.log('[GET /visitors] rows:', result.rows.length);
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
  try {
    const result = await pool.query(`
      SELECT v.visitor_name, v.relation, v.check_in_time, v.check_out_time
      FROM visitors v
      WHERE v.student_user_id = $1
      ORDER BY v.check_in_time DESC LIMIT 20
    `, [req.user.id]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Ziyaretçi geçmişi hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
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
      const stats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE DATE(check_in_time) = CURRENT_DATE) AS today_total,
          COUNT(*) FILTER (WHERE DATE(check_in_time) = CURRENT_DATE AND check_out_time IS NULL) AS currently_inside,
          COUNT(*) FILTER (WHERE DATE(check_in_time) = CURRENT_DATE AND check_out_time IS NOT NULL) AS checked_out
        FROM visitors
      `);

      res.json({ success: true, data: stats.rows[0] });
    } catch (err) {
      console.error("Ziyaretçi istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
