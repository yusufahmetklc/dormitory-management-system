// ╔══════════════════════════════════════════════════════════════════╗
// ║  TEMIZLIK YÖNETİMİ ROUTE'LARI (cleaningRoutes.js)             ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Log depolama: belek_dormitory_module.requests tablosu        ║
// ║  type = 'cleaning_log'                                         ║
// ║  assigned_to = room_id (temizlenen oda)                       ║
// ║  user_id     = cleaned_by (temizleyen personel)               ║
// ║  title       = oda numarası                                    ║
// ║  description = notlar                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

const CLEANING_ROLE = ["Temizlik", "Yönetici", "Admin", "SuperAdmin"];

// Ortak subquery: requests tablosundan son temizlik bilgisi
const LAST_CLEAN_SUBQUERY = `
  SELECT DISTINCT ON (rq.assigned_to)
    rq.assigned_to AS room_id,
    rq.created_at  AS last_cleaned_at,
    TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS last_cleaned_by_name
  FROM belek_dormitory_module.requests rq
  LEFT JOIN public.users u ON u.id = rq.user_id
  WHERE rq.type = 'cleaning_log'
    AND rq.assigned_to IS NOT NULL
  ORDER BY rq.assigned_to, rq.created_at DESC
`;

// ------------------------------------
// GET /cleaning/rooms
// Tüm aktif odaları + son temizlik bilgisiyle döner
// Haftada 2 temizlik ≈ her 3.5 günde bir
// ------------------------------------
router.get("/rooms",
  authenticateToken,
  authorizeRole(...CLEANING_ROLE),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          r.id,
          r.room_number,
          r.floor,
          r.capacity,
          COALESCE(r.current_occupancy, 0) AS current_occupancy,
          b.id   AS building_id,
          b.name AS building_name,
          CASE
            WHEN b.name ILIKE '%k%z%'   THEN 'Kız'
            WHEN b.name ILIKE '%erkek%' THEN 'Erkek'
            ELSE 'Karma'
          END AS building_gender_type,
          cl.last_cleaned_at,
          cl.last_cleaned_by_name,
          CASE
            WHEN cl.last_cleaned_at IS NULL THEN NULL
            ELSE EXTRACT(EPOCH FROM (NOW() - cl.last_cleaned_at)) / 86400.0
          END AS days_since_cleaned
        FROM belek_dormitory_module.rooms r
        JOIN belek_dormitory_module.buildings b ON r.building_id = b.id
        LEFT JOIN (${LAST_CLEAN_SUBQUERY}) cl ON cl.room_id = r.id
        WHERE r.is_active = TRUE
        ORDER BY b.name, r.floor, r.room_number
      `);

      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Temizlik oda listesi hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// GET /cleaning/rooms/:id/history
// Bir odanın temizlik geçmişi (son 20 kayıt)
// ------------------------------------
router.get("/rooms/:id/history",
  authenticateToken,
  authorizeRole(...CLEANING_ROLE),
  async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (isNaN(roomId)) {
      return res.status(400).json({ success: false, message: "Geçersiz oda ID" });
    }
    try {
      const [roomRes, histRes] = await Promise.all([
        pool.query(
          `SELECT r.room_number, r.floor, b.name AS building_name
           FROM belek_dormitory_module.rooms r
           JOIN belek_dormitory_module.buildings b ON b.id = r.building_id
           WHERE r.id = $1`, [roomId]
        ),
        pool.query(
          `SELECT
             rq.id,
             rq.created_at AS cleaned_at,
             rq.description AS notes,
             TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS cleaned_by_name
           FROM belek_dormitory_module.requests rq
           LEFT JOIN public.users u ON u.id = rq.user_id
           WHERE rq.type = 'cleaning_log'
             AND rq.assigned_to = $1
           ORDER BY rq.created_at DESC
           LIMIT 20`, [roomId]
        )
      ]);

      res.json({ success: true, room: roomRes.rows[0] || {}, data: histRes.rows });
    } catch (err) {
      console.error("Temizlik geçmiş hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /cleaning/rooms/:id/clean
// Odayı "temizlendi" olarak işaretle
// ------------------------------------
router.post("/rooms/:id/clean",
  authenticateToken,
  authorizeRole(...CLEANING_ROLE),
  async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (isNaN(roomId)) {
      return res.status(400).json({ success: false, message: "Geçersiz oda ID" });
    }

    const { notes } = req.body || {};

    try {
      const roomCheck = await pool.query(
        `SELECT r.id, r.room_number, b.gender_type AS building_gender_type
         FROM belek_dormitory_module.rooms r
         JOIN belek_dormitory_module.buildings b ON b.id = r.building_id
         WHERE r.id = $1 AND r.is_active = TRUE`,
        [roomId]
      );
      if (roomCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Oda bulunamadı" });
      }

      const room = roomCheck.rows[0];
      const buildingGender = room.building_gender_type; // 'Kız', 'Erkek', 'Karma'

      // Kız bloğu: sadece kadın (female) temizlikci girebilir
      // Yönetici/Admin/SuperAdmin rolü cinsiyet kısıtlamasına tabi değildir
      const staffRole = req.user.user_type;
      const isManagerRole = ['Yönetici', 'Admin', 'SuperAdmin'].includes(staffRole);

      if (!isManagerRole && buildingGender === 'Kız') {
        const staffRes = await pool.query(
          `SELECT gender FROM public.users WHERE id = $1`, [req.user.id]
        );
        const staffGender = staffRes.rows[0]?.gender;
        if (staffGender !== 'female') {
          return res.status(403).json({
            success: false,
            message: `Kız bloğuna sadece kadın temizlik personeli girebilir.`
          });
        }
      }

      // requests tablosuna cleaning_log kaydı ekle
      await pool.query(
        `INSERT INTO belek_dormitory_module.requests
           (user_id, type, title, description, status, assigned_to, created_at, updated_at)
         VALUES ($1, 'cleaning_log', $2, $3, 'Tamamlandı', $4, NOW(), NOW())`,
        [req.user.id, `Oda ${room.room_number}`, notes || null, roomId]
      );

      res.json({
        success: true,
        message: `Oda ${room.room_number} temizlendi olarak işaretlendi`
      });
    } catch (err) {
      console.error("Oda temizlendi işaretleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// GET /cleaning/stats
// Dashboard özet: haftada 2 temizlik (≈3.5 günde bir)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole(...CLEANING_ROLE),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(r.id)::INTEGER AS total_rooms,
          COUNT(CASE WHEN cl.last_cleaned_at >= NOW() - INTERVAL '1 day'  THEN 1 END)::INTEGER AS cleaned_today,
          COUNT(CASE WHEN cl.last_cleaned_at >= NOW() - INTERVAL '3 days'
                      AND cl.last_cleaned_at <  NOW() - INTERVAL '1 day'  THEN 1 END)::INTEGER AS clean,
          COUNT(CASE WHEN cl.last_cleaned_at IS NULL
                      OR  cl.last_cleaned_at <  NOW() - INTERVAL '4 days' THEN 1 END)::INTEGER AS overdue
        FROM belek_dormitory_module.rooms r
        LEFT JOIN (${LAST_CLEAN_SUBQUERY}) cl ON cl.room_id = r.id
        WHERE r.is_active = TRUE
      `);

      const s = result.rows[0];
      res.json({
        success: true,
        data: {
          total_rooms:   s.total_rooms,
          cleaned_today: s.cleaned_today,
          clean:         s.clean,
          overdue:       s.overdue
        }
      });
    } catch (err) {
      console.error("Temizlik istatistik hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
