// ╔══════════════════════════════════════════════════════════════════╗
// ║  BAKIM/ONARIM YÖNETİMİ ROUTE'LARI (maintenanceRoutes.js)     ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Bakım personeli ve yöneticiler tarafından kullanılır.        ║
// ║  Yurt içi bakım/onarım taleplerini yönetir.                   ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /maintenance           → Tüm bakım kayıtları           ║
// ║  POST /maintenance           → Yeni bakım talebi oluştur     ║
// ║  PUT  /maintenance/:id/status→ Bakım durumunu güncelle        ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /maintenance
// Yeni bakım kaydı oluşturur (Yönetici/Bakım)
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Bakım", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { room_id, complaint_id, description, maintenance_type, cost, scheduled_date } = req.body || {};

    if (!description) {
      return res.status(400).json({ success: false, message: "Bakım açıklaması zorunlu" });
    }

    console.log('[POST /maintenance] user:', req.user.id, 'body:', JSON.stringify(req.body));
    try {
      const result = await pool.query(
        `INSERT INTO maintenance_logs (room_id, complaint_id, description, performed_by, maintenance_type, cost, scheduled_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [room_id, complaint_id, description, req.user.id,
         maintenance_type || 'Diğer', cost || 0, scheduled_date]
      );

      // Eğer şikayetle ilişkiliyse, şikayeti "İnceleniyor" olarak güncelle
      if (complaint_id) {
        await pool.query(
          "UPDATE complaints SET status = 'İnceleniyor', assigned_to = $1, updated_at = NOW() WHERE id = $2 AND status = 'Beklemede'",
          [req.user.id, complaint_id]
        );
      }

      console.log('[POST /maintenance] created id:', result.rows[0]?.id);
      res.status(201).json({ success: true, message: "Bakım kaydı oluşturuldu", data: result.rows[0] });
    } catch (err) {
      console.error("Bakım kayıt hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /maintenance/:id/status
// Bakım durumunu günceller
// ------------------------------------
router.patch("/:id/status",
  authenticateToken,
  authorizeRole("Yönetici", "Bakım", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { status, cost, notes } = req.body || {};

    const validStatuses = ['Planlandı', 'Devam Ediyor', 'Tamamlandı', 'İptal'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum" });
    }

    try {
      const setClauses = ["updated_at = NOW()"];
      const params = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        params.push(status);
        if (status === 'Tamamlandı') {
          setClauses.push("completed_at = NOW()");
        }
      }
      if (cost !== undefined) {
        setClauses.push(`cost = $${idx++}`);
        params.push(cost);
      }

      params.push(req.params.id);

      const maintenance = await pool.query(
        `UPDATE maintenance_logs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      if (maintenance.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Bakım kaydı bulunamadı" });
      }

      // Bakım tamamlandıysa ilişkili şikayeti de çöz
      if (status === 'Tamamlandı' && maintenance.rows[0].complaint_id) {
        await pool.query(
          "UPDATE complaints SET status = 'Çözüldü', resolved_at = NOW(), updated_at = NOW() WHERE id = $1",
          [maintenance.rows[0].complaint_id]
        );
      }

      res.json({ success: true, message: "Bakım kaydı güncellendi" });
    } catch (err) {
      console.error("Bakım güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /maintenance
// Bakım kayıtlarını listeler
// Query: ?room_id=1&status=Planlandı&type=Elektrik
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Yönetici", "Bakım", "Temizlik", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { room_id, status, type } = req.query;
      let query = `
        SELECT ml.*,
               r.room_number, b.name AS building_name, r.floor,
               u.first_name AS performer_first, u.last_name AS performer_last,
               c.title AS complaint_title, c.category AS complaint_category
        FROM maintenance_logs ml
        LEFT JOIN rooms r ON ml.room_id = r.id
        LEFT JOIN buildings b ON r.building_id = b.id
        LEFT JOIN users u ON ml.performed_by = u.id
        LEFT JOIN complaints c ON ml.complaint_id = c.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      // Bakım personeli sadece kendi kayıtlarını görsün
      if (['Bakım', 'Temizlik'].includes(req.user.user_type)) {
        query += ` AND ml.performed_by = $${idx++}`;
        params.push(req.user.id);
      }

      if (room_id) { query += ` AND ml.room_id = $${idx++}`; params.push(room_id); }
      if (status) { query += ` AND ml.status = $${idx++}`; params.push(status); }
      if (type) { query += ` AND ml.maintenance_type = $${idx++}`; params.push(type); }

      query += " ORDER BY CASE ml.status WHEN 'Planlandı' THEN 1 WHEN 'Devam Ediyor' THEN 2 ELSE 3 END, ml.created_at DESC";

      const result = await pool.query(query, params);
      console.log('[GET /maintenance] rows:', result.rows.length, 'user:', req.user.id);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Bakım listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /maintenance/stats
// Bakım istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Planlandı') AS planned,
          COUNT(*) FILTER (WHERE status = 'Devam Ediyor') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'Tamamlandı') AS completed,
          COALESCE(SUM(cost), 0) AS total_cost,
          COALESCE(SUM(cost) FILTER (WHERE status = 'Tamamlandı'), 0) AS completed_cost
        FROM maintenance_logs
      `);

      const byType = await pool.query(`
        SELECT maintenance_type, COUNT(*) AS count, COALESCE(SUM(cost), 0) AS total_cost
        FROM maintenance_logs
        GROUP BY maintenance_type ORDER BY count DESC
      `);

      res.json({ success: true, data: { summary: stats.rows[0], by_type: byType.rows } });
    } catch (err) {
      console.error("Bakım istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
