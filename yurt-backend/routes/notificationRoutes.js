// ╔══════════════════════════════════════════════════════════════════╗
// ║  BİLDİRİM ROUTE'LARI (routes/notificationRoutes.js)           ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Öğrenci ve personel bildirimleri.                              ║
// ║  Sistem bazlı otomatik bildirimler ve okunma takibi.           ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET /notifications/my          → Kullanıcının bildirimleri  ║
// ║  GET /notifications/unread-count→ Okunmamış bildirim sayısı   ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// GET /notifications/my
// Kullanıcının kendi bildirimlerini listeler
// Query: ?unread_only=true&limit=20
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const { unread_only, limit: queryLimit } = req.query;
    let query = `
      SELECT * FROM notification_logs
      WHERE user_id = $1
    `;
    const params = [req.user.id];
    let idx = 2;

    if (unread_only === 'true') {
      query += " AND is_read = FALSE";
    }

    query += " ORDER BY created_at DESC";

    const rowLimit = parseInt(queryLimit) || 30;
    query += ` LIMIT $${idx++}`;
    params.push(rowLimit);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Bildirim listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /notifications/unread-count
// Okunmamış bildirim sayısı
// ------------------------------------
router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) AS count FROM notification_logs WHERE user_id = $1 AND is_read = FALSE",
      [req.user.id]
    );
    res.json({ success: true, data: { count: parseInt(result.rows[0].count) } });
  } catch (err) {
    console.error("Bildirim sayısı hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// PATCH /notifications/:id/read
// Bildirimi okundu olarak işaretle
// ------------------------------------
router.patch("/:id/read", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notification_logs SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: "Bildirim okundu" });
  } catch (err) {
    console.error("Bildirim okuma hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// PATCH /notifications/read-all
// Tüm bildirimleri okundu olarak işaretle
// ------------------------------------
router.patch("/read-all", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notification_logs SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE",
      [req.user.id]
    );
    res.json({ success: true, message: "Tüm bildirimler okundu" });
  } catch (err) {
    console.error("Toplu bildirim okuma hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// POST /notifications
// Bildirim gönder (Yönetici)
// Body: { user_id, title, message, notification_type }
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, title, message, notification_type, related_type, related_id } = req.body || {};

    if (!user_id || !title || !message) {
      return res.status(400).json({ success: false, message: "user_id, başlık ve mesaj zorunlu" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO notification_logs (user_id, title, message, notification_type, related_type, related_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user_id, title, message, notification_type || 'Bilgi', related_type, related_id]
      );

      res.status(201).json({ success: true, message: "Bildirim gönderildi", data: result.rows[0] });
    } catch (err) {
      console.error("Bildirim gönderme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /notifications/bulk
// Toplu bildirim gönder (Yönetici)
// Body: { user_ids: [1,2,3], title, message, notification_type }
// ------------------------------------
router.post("/bulk",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_ids, title, message, notification_type } = req.body || {};

    if (!user_ids || !Array.isArray(user_ids) || !title || !message) {
      return res.status(400).json({ success: false, message: "user_ids dizisi, başlık ve mesaj zorunlu" });
    }

    try {
      const values = user_ids.map((uid, i) => {
        const base = i * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      }).join(', ');

      const params = [];
      user_ids.forEach(uid => {
        params.push(uid, title, message, notification_type || 'Bilgi');
      });

      await pool.query(
        `INSERT INTO notification_logs (user_id, title, message, notification_type) VALUES ${values}`,
        params
      );

      res.status(201).json({ success: true, message: `${user_ids.length} kullanıcıya bildirim gönderildi` });
    } catch (err) {
      console.error("Toplu bildirim hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
