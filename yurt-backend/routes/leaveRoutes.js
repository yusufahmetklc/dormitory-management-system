// ╔══════════════════════════════════════════════════════════════════╗
// ║  İZİN TALEBİ ROUTE'LARI (routes/leaveRoutes.js)                ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Öğrenci izin talebi oluşturur, yönetici onaylar/reddeder.    ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /leaves     → Tüm izin taleplerini listele               ║
// ║  GET  /leaves/my  → Öğrencinin kendi talepleri                 ║
// ║  POST /leaves     → Yeni izin talebi oluştur                   ║
// ║  PUT  /leaves/:id → İzin talebini onayla/reddet                ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /leaves
// Yeni izin talebi oluşturur (Öğrenci)
// ------------------------------------
router.post("/", authenticateToken, async (req, res) => {
  const { leave_type, start_date, end_date, reason, destination } = req.body || {};

  if (!leave_type || !start_date || !end_date || !reason) {
    return res.status(400).json({ success: false, message: "İzin tipi, tarihler ve sebep zorunlu" });
  }

  const validTypes = ['Hafta Sonu', 'Tatil', 'Sağlık', 'Aile', 'Resmi', 'Diğer'];
  if (!validTypes.includes(leave_type)) {
    return res.status(400).json({ success: false, message: "Geçersiz izin tipi" });
  }

  if (new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ success: false, message: "Bitiş tarihi başlangıçtan önce olamaz" });
  }

  console.log('[POST /leaves] user:', req.user.id, 'body:', JSON.stringify(req.body));
  try {
    // Çakışan izin var mı kontrol
    const overlap = await pool.query(
      `SELECT id FROM leave_requests
       WHERE user_id = $1 AND status IN ('Beklemede', 'Onaylandı')
       AND start_date <= $3 AND end_date >= $2`,
      [req.user.id, start_date, end_date]
    );

    if (overlap.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Bu tarih aralığında çakışan bir izin talebiniz var" });
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, destination)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, leave_type, start_date, end_date, reason, destination]
    );

    console.log('[POST /leaves] created id:', result.rows[0]?.id);
    res.status(201).json({ success: true, message: "İzin talebi oluşturuldu", data: result.rows[0] });
  } catch (err) {
    console.error("İzin talebi hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /leaves/my
// Kendi izin taleplerini listeler (Öğrenci)
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lr.*,
             ap.first_name AS approver_first, ap.last_name AS approver_last
      FROM leave_requests lr
      LEFT JOIN users ap ON lr.approved_by = ap.id
      WHERE lr.user_id = $1
      ORDER BY lr.created_at DESC
    `, [req.user.id]);

    console.log('[GET /leaves/my] user:', req.user.id, 'rows:', result.rows.length);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("İzin listeleme hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /leaves
// Tüm izin taleplerini listeler (Yönetici)
// Query: ?status=Beklemede&user_id=23
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { status, user_id, leave_type } = req.query;
      let query = `
        SELECT lr.*,
               u.first_name, u.last_name, u.email,
               sp.student_number, sp.phone,
               r.room_number, b.name AS building_name,
               ap.first_name AS approver_first, ap.last_name AS approver_last
        FROM leave_requests lr
        JOIN users u ON lr.user_id = u.id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN room_assignments ra ON ra.user_id = u.id AND ra.status = 'Aktif'
        LEFT JOIN rooms r ON ra.room_id = r.id
        LEFT JOIN buildings b ON r.building_id = b.id
        LEFT JOIN users ap ON lr.approved_by = ap.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      if (status) {
        query += ` AND lr.status = $${idx++}`;
        params.push(status);
      }
      if (user_id) {
        query += ` AND lr.user_id = $${idx++}`;
        params.push(user_id);
      }
      if (leave_type) {
        query += ` AND lr.leave_type = $${idx++}`;
        params.push(leave_type);
      }

      query += " ORDER BY CASE lr.status WHEN 'Beklemede' THEN 1 WHEN 'Onaylandı' THEN 2 ELSE 3 END, lr.created_at DESC";

      const result = await pool.query(query, params);
      console.log('[GET /leaves] rows:', result.rows.length);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("İzin listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /leaves/:id
// İzin talebini onayla/reddet (Yönetici)
// Body: { status, rejection_reason }
// ------------------------------------
router.patch("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { status, rejection_reason, notes } = req.body || {};

    const validStatuses = ['Onaylandı', 'Reddedildi', 'İptal'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum" });
    }

    try {
      const leave = await pool.query("SELECT * FROM leave_requests WHERE id = $1", [req.params.id]);
      if (leave.rows.length === 0) {
        return res.status(404).json({ success: false, message: "İzin talebi bulunamadı" });
      }

      await pool.query(
        `UPDATE leave_requests SET
          status = $1, approved_by = $2, approved_at = NOW(),
          rejection_reason = $3, notes = $4, updated_at = NOW()
         WHERE id = $5`,
        [status, req.user.id, rejection_reason, notes, req.params.id]
      );

      res.json({ success: true, message: `İzin talebi ${status === 'Onaylandı' ? 'onaylandı' : status === 'Reddedildi' ? 'reddedildi' : 'iptal edildi'}` });
    } catch (err) {
      console.error("İzin güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /leaves/:id/return
// İzinden dönüş kaydı (Güvenlik/Yönetici)
// ------------------------------------
router.patch("/:id/return",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const leave = await pool.query(
        "SELECT * FROM leave_requests WHERE id = $1 AND status = 'Onaylandı'",
        [req.params.id]
      );

      if (leave.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Onaylanmış izin bulunamadı" });
      }

      await pool.query(
        "UPDATE leave_requests SET status = 'Dönüş Yapıldı', return_date = NOW(), updated_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      res.json({ success: true, message: "Dönüş kaydı oluşturuldu" });
    } catch (err) {
      console.error("Dönüş kaydı hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /leaves/stats
// İzin istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending,
          COUNT(*) FILTER (WHERE status = 'Onaylandı') AS approved,
          COUNT(*) FILTER (WHERE status = 'Reddedildi') AS rejected,
          COUNT(*) FILTER (WHERE status = 'Onaylandı' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE) AS currently_on_leave
        FROM leave_requests
      `);

      const byType = await pool.query(`
        SELECT leave_type, COUNT(*) AS count
        FROM leave_requests
        GROUP BY leave_type ORDER BY count DESC
      `);

      res.json({ success: true, data: { summary: stats.rows[0], by_type: byType.rows } });
    } catch (err) {
      console.error("İzin istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
