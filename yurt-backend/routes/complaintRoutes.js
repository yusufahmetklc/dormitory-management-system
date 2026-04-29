// ╔══════════════════════════════════════════════════════════════════╗
// ║  ŞİKAYET & ARIZA BİLDİRİMİ ROUTE'LARI (complaintRoutes.js)    ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Öğrenciler şikayet oluşturur, yönetici/personel yönetir.      ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /complaints           → Tüm şikayetleri listele         ║
// ║  POST /complaints           → Yeni şikayet oluştur            ║
// ║  PUT  /complaints/:id/status→ Şikayet durumunu güncelle        ║
// ║                                                                  ║
// ║  DURUM DEĞERLERİ: Beklemede → İnceleniyor → Çözüldü/Reddedildi║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// POST /complaints
// Yeni şikayet/arıza bildirimi oluşturur (Öğrenci)
// Body: { category, title, description, priority }
// ------------------------------------
router.post("/", authenticateToken, async (req, res) => {
  const { category, title, description } = req.body;
  const user_id = req.user.id;

  const validCategories = ['Arıza', 'Şikayet', 'Öneri', 'Temizlik', 'Güvenlik', 'Oda', 'Yemek', 'Gürültü', 'Teknik', 'Diğer'];

  if (!user_id) {
    return res.status(401).json({ success: false, message: "Kimlik doğrulama gerekli" });
  }
  if (!description) {
    return res.status(400).json({ success: false, message: "Açıklama zorunlu" });
  }
  if (!category || !validCategories.includes(category)) {
    return res.status(400).json({ success: false, message: "Geçersiz kategori" });
  }
  if (!title) {
    return res.status(400).json({ success: false, message: "Başlık zorunlu" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO complaints (user_id, category, title, description, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id, user_id, category, title, description, status, created_at`,
      [user_id, category, title, description]
    );

    res.status(201).json({ success: true, message: "Talep oluşturuldu", data: result.rows[0] });
  } catch (err) {
    console.error("Talep oluşturma hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /complaints/my
// Kendi bildirimlerini listeler (Öğrenci)
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.user_id, c.category, c.title, c.description,
             CASE c.status
               WHEN 'pending'     THEN 'Beklemede'
               WHEN 'in_progress' THEN 'İnceleniyor'
               WHEN 'approved'    THEN 'Çözüldü'
               WHEN 'rejected'    THEN 'Reddedildi'
               ELSE c.status END AS status,
             c.created_at
      FROM complaints c
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Kendi şikayetler hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /complaints
// Tüm bildirimleri listeler (Yönetici/Personel)
// Query: ?status=Beklemede&category=Arıza&priority=Acil
// ------------------------------------
router.get("/",
  authenticateToken,
  authorizeRole("Yönetici", "Bakım", "Temizlik", "Güvenlik", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { category } = req.query;
      let query = `
        SELECT c.id, c.user_id, c.category, c.title, c.description,
               CASE c.status
                 WHEN 'pending'     THEN 'Beklemede'
                 WHEN 'in_progress' THEN 'İnceleniyor'
                 WHEN 'approved'    THEN 'Çözüldü'
                 WHEN 'rejected'    THEN 'Reddedildi'
                 ELSE c.status END AS status,
               c.priority, c.created_at,
               u.first_name, u.last_name, u.email
        FROM complaints c
        JOIN users u ON c.user_id = u.id
        WHERE 1=1
      `;
      const params = [];
      let idx = 1;

      if (req.user.user_type === 'Bakım') {
        query += ` AND c.category = 'Arıza'`;
      }

      if (category) {
        query += ` AND c.category = $${idx++}`;
        params.push(category);
      }

      query += " ORDER BY c.created_at DESC";

      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Şikayet listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /complaints/:id/status
// Bildirim durumunu günceller (Yönetici)
// Body: { status, response, assigned_to }
// ------------------------------------
router.patch("/:id/status",
  authenticateToken,
  authorizeRole("Yönetici", "Bakım", "Temizlik", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { status, response } = req.body;
      const statusMap = {
        'Beklemede':   'pending',
        'İnceleniyor': 'in_progress',
        'Çözüldü':     'approved',
        'Reddedildi':  'rejected'
      };
      const dbStatus = statusMap[status] || 'pending';

      await pool.query(
        `UPDATE complaints
         SET status = $1, response = $2, updated_at = NOW()
         WHERE id = $3`,
        [dbStatus, response || null, req.params.id]
      );
      res.json({ success: true, message: "Bildirim güncellendi" });
    } catch (err) {
      console.error("Şikayet güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /complaints/stats
// Şikayet istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE category = 'Arıza') AS faults,
          COUNT(*) FILTER (WHERE category = 'Şikayet') AS complaints_count,
          COUNT(*) FILTER (WHERE category = 'Temizlik') AS cleaning,
          COUNT(*) FILTER (WHERE category = 'Güvenlik') AS security,
          COUNT(*) FILTER (WHERE category = 'Öneri') AS suggestions
        FROM complaints
      `);
      res.json({ success: true, data: stats.rows[0] });
    } catch (err) {
      console.error("Şikayet istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /complaints/:id
// Talebi siler
// Yönetici her talebi silebilir; öğrenci sadece kendi talebini silebilir
// ------------------------------------
router.delete("/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: "Geçersiz talep ID" });
      }

      const adminRoles = ['Yönetici', 'Admin', 'SuperAdmin'];
      const isAdmin = adminRoles.includes(req.user.user_type);

      let result;
      if (isAdmin) {
        result = await pool.query('DELETE FROM complaints WHERE id = $1 RETURNING id', [id]);
      } else {
        // Öğrenci sadece kendi talebini silebilir
        result = await pool.query(
          'DELETE FROM complaints WHERE id = $1 AND user_id = $2 RETURNING id',
          [id, req.user.id]
        );
      }

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: "Talep bulunamadı veya silme yetkiniz yok" });
      }

      res.json({ success: true, message: "Talep silindi" });
    } catch (err) {
      console.error("Talep silme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
