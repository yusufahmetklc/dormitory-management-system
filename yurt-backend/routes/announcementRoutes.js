// ╔══════════════════════════════════════════════════════════════════╗
// ║  DUYURU ROUTE'LARI (routes/announcementRoutes.js)              ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Yönetici duyuru oluşturur, tüm kullanıcılar görüntüler.      ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /announcements/all → Tüm duyurular (Yönetici)           ║
// ║  GET  /announcements     → Aktif duyurular (Öğrenci/herkes)   ║
// ║  POST /announcements     → Yeni duyuru (Yönetici)             ║
// ║  DELETE /announcements/:id → Sil (Yönetici)                   ║
// ║                                                                  ║
// ║  Zamanlama (publish_at / expires_at) içerik alanında JSON     ║
// ║  olarak saklanır — Geriye uyumlu (eski düz metin çalışır)     ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// Yardımcı: İçerik alanını ayrıştır
// Yeni format: JSON { text, category, publish_at, expires_at }
// Eski format: düz metin (geriye uyumluluk)
// ------------------------------------
function parseAnn(row) {
  let text = row.content || '';
  let category = 'Genel';
  let publish_at = null;
  let expires_at = null;

  try {
    const parsed = JSON.parse(row.content);
    if (parsed && typeof parsed === 'object' && 'text' in parsed) {
      text       = parsed.text       || '';
      category   = parsed.category   || 'Genel';
      publish_at = parsed.publish_at || null;
      expires_at = parsed.expires_at || null;
    }
  } catch { /* eski düz metin içerik */ }

  const now  = new Date();
  const isScheduled = publish_at && new Date(publish_at) > now;
  const isExpired   = expires_at && new Date(expires_at) <= now;
  const status = isScheduled ? 'scheduled' : isExpired ? 'expired' : 'active';

  return {
    id: row.id,
    title: row.title,
    content: text,
    category,
    publish_at,
    expires_at,
    created_at: row.created_at,
    status,
    author_first: row.author_first_name || null,
    author_last:  row.author_last_name  || null,
  };
}

// ------------------------------------
// GET /announcements/all
// Tüm duyuruları döner (Yönetici) — durum bilgisiyle
// ------------------------------------
router.get("/all",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT a.id, a.title, a.content, a.created_at,
               u.first_name AS author_first_name, u.last_name AS author_last_name
        FROM announcements a
        LEFT JOIN users u ON a.created_by = u.id
        ORDER BY a.created_at DESC
      `);
      res.json({ success: true, data: result.rows.map(parseAnn) });
    } catch (err) {
      console.error("Duyuru listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /announcements
// Sadece aktif duyuruları döner (herkes)
// publish_at geçmemiş veya boş, expires_at dolmamış veya boş
// ------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.title, a.content, a.created_at,
             u.first_name AS author_first_name, u.last_name AS author_last_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `);

    const now = new Date();
    const data = result.rows
      .map(parseAnn)
      .filter(a => {
        if (a.publish_at && new Date(a.publish_at) > now) return false;
        if (a.expires_at && new Date(a.expires_at) <= now) return false;
        return true;
      });

    res.json({ success: true, data });
  } catch (err) {
    console.error("Duyuru listeleme hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// POST /announcements
// Yeni duyuru oluşturur (Yönetici)
// Body: { title, content, category, publish_at?, expires_at? }
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const {
      title,
      content,
      category  = 'Genel',
      publish_at = null,
      expires_at = null
    } = req.body || {};

    if (!title || !content) {
      return res.status(400).json({ success: false, message: "Başlık ve içerik zorunlu" });
    }
    if (publish_at && expires_at && new Date(publish_at) >= new Date(expires_at)) {
      return res.status(400).json({ success: false, message: "Bitiş tarihi, yayın tarihinden sonra olmalı" });
    }

    // İçeriği zamanlama bilgisiyle birlikte JSON olarak sakla
    const contentJson = JSON.stringify({
      text: content,
      category: category || 'Genel',
      publish_at: publish_at || null,
      expires_at: expires_at || null,
    });

    try {
      const result = await pool.query(
        `INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3) RETURNING id, title, content, created_at`,
        [title, contentJson, req.user.id]
      );
      const ann = parseAnn(result.rows[0]);
      res.status(201).json({ success: true, message: "Duyuru oluşturuldu", data: ann });
    } catch (err) {
      console.error("Duyuru oluşturma hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /announcements/:id
// Duyuruyu kalıcı olarak siler (Yönetici)
// ------------------------------------
router.delete("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await pool.query("DELETE FROM announcements WHERE id = $1", [req.params.id]);
      res.json({ success: true, message: "Duyuru kaldırıldı" });
    } catch (err) {
      console.error("Duyuru silme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
