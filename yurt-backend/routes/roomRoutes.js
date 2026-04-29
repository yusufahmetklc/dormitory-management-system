// ╔══════════════════════════════════════════════════════════════════╗
// ║  ODA YÖNETİMİ ROUTE'LARI (routes/roomRoutes.js)                ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Bina ve oda CRUD işlemleri, oda arama, doluluk takibi.        ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /rooms           → Tüm odaları listele                  ║
// ║  GET  /rooms/buildings → Binaları listele                      ║
// ║  GET  /rooms/:id       → Tek oda detayı                       ║
// ║  POST /rooms           → Yeni oda ekle                        ║
// ║  GET  /rooms/stats/overview → Oda istatistikleri               ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// GET /rooms/buildings
// Tüm binaları listeler
// ------------------------------------
router.get("/buildings", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id) AS total_rooms,
        (SELECT COALESCE(SUM(r.current_occupancy), 0) FROM rooms r WHERE r.building_id = b.id) AS current_total
      FROM buildings b
      WHERE b.is_active = TRUE
      ORDER BY b.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Bina listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// POST /rooms/buildings
// Yeni bina ekler (Sadece Yönetici)
// ------------------------------------
router.post("/buildings",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { name, address } = req.body || {};
    try {
      const result = await pool.query(
        `INSERT INTO buildings (name, address, is_active, created_at, updated_at)
         VALUES ($1, $2, TRUE, NOW(), NOW()) RETURNING *`,
        [name, address || '']
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Bina ekleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /rooms
// Odaları listeler (filtreleme destekli)
// Query: ?building_id=1&floor=2&status=Boş&type=Çift
// ------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { building_id, floor, status, type } = req.query;
    let query = `
      SELECT r.*,
             b.name AS building_name,
             COALESCE(occ.real_occ, 0) AS current_occupancy,
             CASE
               WHEN COALESCE(occ.real_occ, 0) = 0          THEN 'Boş'
               WHEN COALESCE(occ.real_occ, 0) >= r.capacity THEN 'Dolu'
               ELSE 'Kısmi'
             END AS status
      FROM rooms r
      JOIN buildings b ON r.building_id = b.id
      LEFT JOIN (
        SELECT room_id, COUNT(*) AS real_occ
        FROM room_assignments
        WHERE is_active = TRUE
        GROUP BY room_id
      ) occ ON occ.room_id = r.id
      WHERE r.is_active = TRUE
    `;
    const params = [];
    let paramIndex = 1;

    if (building_id) {
      query += ` AND r.building_id = $${paramIndex++}`;
      params.push(building_id);
    }
    if (floor) {
      query += ` AND r.floor = $${paramIndex++}`;
      params.push(floor);
    }
    if (status) {
      query += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }
    if (type) {
      query += ` AND r.room_type = $${paramIndex++}`;
      params.push(type);
    }

    query += " ORDER BY b.name, r.floor, r.room_number";

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Oda listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// POST /rooms
// Yeni oda ekler (Sadece Yönetici)
// ------------------------------------
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { building_id, floor, room_number, capacity } = req.body || {};
    try {
      // floor_id'yi floors tablosundan al veya yoksa oluştur
      let floorId = null;
      const flRes = await pool.query(
        'SELECT id FROM floors WHERE building_id = $1 AND floor_number = $2',
        [building_id, floor || 1]
      );
      if (flRes.rows.length > 0) {
        floorId = flRes.rows[0].id;
      } else {
        const newFloor = await pool.query(
          'INSERT INTO floors (building_id, floor_number) VALUES ($1, $2) RETURNING id',
          [building_id, floor || 1]
        );
        floorId = newFloor.rows[0].id;
      }
      const result = await pool.query(
        `INSERT INTO rooms (building_id, floor, floor_id, room_number, capacity, current_occupancy, status, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, 'Boş', TRUE, NOW(), NOW()) RETURNING *`,
        [building_id, floor || 1, floorId, room_number, capacity || 2]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error("Oda ekleme hatası:", err);
      if (err.code === '23505') {
        return res.status(400).json({ success: false, message: "Bu oda numarası zaten mevcut" });
      }
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /rooms/structure
// Bina → Kat → Oda hiyerarşisini döner
// ------------------------------------
router.get("/structure", authenticateToken, async (req, res) => {
  try {
    const buildings = await pool.query(`
      SELECT id, name
      FROM buildings
      WHERE is_active = TRUE
      ORDER BY name
    `);

    if (buildings.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Get all floors
    const floors = await pool.query(`
      SELECT f.id, f.building_id, f.floor_number
      FROM floors f
      JOIN buildings b ON f.building_id = b.id
      WHERE b.is_active = TRUE
      ORDER BY f.building_id, f.floor_number
    `);

    // Get all rooms (fallback: match via floor col if floor_id not set)
    const rooms = await pool.query(`
      SELECT
        r.id, r.building_id, r.room_number,
        r.capacity, r.current_occupancy, r.status,
        COALESCE(r.floor_id, fl.id) AS floor_id
      FROM rooms r
      LEFT JOIN floors fl
        ON fl.building_id = r.building_id
        AND fl.floor_number = COALESCE(r.floor, 1)
      WHERE r.is_active = TRUE
      ORDER BY r.floor, r.room_number
    `);

    // Build floor map: floor_id → floor object with rooms array
    const floorById = {};
    for (const f of floors.rows) {
      floorById[f.id] = { ...f, rooms: [] };
    }

    // Assign rooms to floors
    for (const room of rooms.rows) {
      if (room.floor_id && floorById[room.floor_id]) {
        floorById[room.floor_id].rooms.push(room);
      }
    }

    // Build building map: building_id → floors array
    const buildingFloors = {};
    for (const f of Object.values(floorById)) {
      if (!buildingFloors[f.building_id]) buildingFloors[f.building_id] = [];
      buildingFloors[f.building_id].push(f);
    }

    const result = buildings.rows.map(b => ({
      ...b,
      floors: (buildingFloors[b.id] || []).sort((a, c) => a.floor_number - c.floor_number)
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Yapı getirme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /rooms/available
// Boş yer bulunan odaları listeler (current_occupancy < capacity)
// Doluluk room_assignments tablosundan gerçek zamanlı hesaplanır
// ------------------------------------
router.get("/available", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.room_number, r.capacity, r.floor,
             b.name AS building_name,
             COALESCE(occ.real_occ, 0) AS current_occupancy
      FROM rooms r
      JOIN buildings b ON r.building_id = b.id
      LEFT JOIN (
        SELECT room_id, COUNT(*) AS real_occ
        FROM room_assignments
        WHERE is_active = TRUE
        GROUP BY room_id
      ) occ ON occ.room_id = r.id
      WHERE r.is_active = TRUE
        AND COALESCE(occ.real_occ, 0) < r.capacity
      ORDER BY b.name, r.floor, r.room_number
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Boş oda listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /rooms/:id
// Tek oda detayı + sakinleri
// ------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const room = await pool.query(`
      SELECT r.*, b.name AS building_name
      FROM rooms r JOIN buildings b ON r.building_id = b.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (room.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Oda bulunamadı" });
    }

    // Odadaki mevcut sakinler
    const residents = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, ra.start_date
      FROM room_assignments ra
      JOIN users u ON ra.user_id = u.id
      WHERE ra.room_id = $1 AND ra.is_active = TRUE
      ORDER BY ra.start_date
    `, [req.params.id]);

    // current_occupancy'yi gerçek sakin sayısıyla senkronize et
    const realOcc = residents.rows.length;
    const cap     = room.rows[0].capacity || 1;
    const realStatus = realOcc === 0 ? 'Boş' : realOcc >= cap ? 'Dolu' : 'Kısmi';
    if (room.rows[0].current_occupancy !== realOcc) {
      await pool.query(
        'UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [realOcc, realStatus, req.params.id]
      );
    }

    res.json({
      success: true,
      data: {
        ...room.rows[0],
        current_occupancy: realOcc,
        status: realStatus,
        residents: residents.rows
      }
    });
  } catch (err) {
    console.error("Oda detay hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /rooms/stats/overview
// Genel oda istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats/overview",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT
          COUNT(*) AS total_rooms,
          SUM(capacity) AS total_capacity,
          SUM(current_occupancy) AS total_occupancy,
          COUNT(*) FILTER (WHERE status = 'Boş') AS empty_rooms,
          COUNT(*) FILTER (WHERE status = 'Dolu') AS full_rooms,
          COUNT(*) FILTER (WHERE status = 'Kısmi') AS partial_rooms,
          COUNT(*) FILTER (WHERE status = 'Bakımda') AS maintenance_rooms
        FROM rooms WHERE is_active = TRUE
      `);
      res.json({ success: true, data: stats.rows[0] });
    } catch (err) {
      console.error("Oda istatistik hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// Bina adından cinsiyet tipini çıkar (DB kolonu gerekmez)
function inferBuildingGender(buildingName) {
  if (!buildingName) return null;
  const n = buildingName.toLowerCase();
  if (n.includes('kız') || n.includes('bayan') || n.includes('kadın')) return 'female';
  if (n.includes('erkek') || n.includes('bay'))  return 'male';
  return null; // karma/bilinmiyor → kısıtlama yok
}

// POST /rooms/:id/assign
// Odaya öğrenci ata
// ------------------------------------
router.post("/:id/assign",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const roomId = req.params.id;
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ success: false, message: "user_id gerekli" });

    try {
      // Oda + bina bilgisini al
      const roomRes = await pool.query(
        `SELECT r.id, r.capacity, r.current_occupancy, r.status, b.name AS building_name
         FROM rooms r JOIN buildings b ON r.building_id = b.id
         WHERE r.id = $1 AND r.is_active = TRUE`,
        [roomId]
      );
      if (roomRes.rows.length === 0)
        return res.status(404).json({ success: false, message: "Oda bulunamadı" });

      // ── Cinsiyet doğrulaması ──────────────────────────────
      const buildingGender = inferBuildingGender(roomRes.rows[0].building_name);
      if (buildingGender) {
        // users.gender sütunu varsa kontrol et
        try {
          const stuRes = await pool.query(
            'SELECT gender FROM users WHERE id = $1',
            [user_id]
          );
          if (stuRes.rows.length > 0) {
            const stuGender = stuRes.rows[0].gender;
            if (stuGender && stuGender !== buildingGender) {
              const bldLabel = buildingGender === 'female' ? 'Kız Bloğu' : 'Erkek Bloğu';
              return res.status(400).json({
                success: false,
                message: `Bu öğrenci ${bldLabel}'na atanamaz (cinsiyet uyumsuzluğu)`
              });
            }
          }
        } catch (_) {
          // gender kolonu henüz yoksa doğrulamayı atla
        }
      }
      // ─────────────────────────────────────────────────────

      const room = roomRes.rows[0];
      if (room.current_occupancy >= room.capacity)
        return res.status(400).json({ success: false, message: "Oda dolu, kapasite aşıldı" });

      // Zaten aktif atama var mı? (aynı oda)
      const exists = await pool.query(
        'SELECT id FROM room_assignments WHERE user_id = $1 AND room_id = $2 AND is_active = TRUE',
        [user_id, roomId]
      );
      if (exists.rows.length > 0)
        return res.status(400).json({ success: false, message: "Öğrenci zaten bu odada kayıtlı" });

      // Başka bir odada aktif ataması var mı? → blokla
      const otherRoom = await pool.query(
        `SELECT ra.room_id, r.room_number, b.name AS building_name
         FROM room_assignments ra
         JOIN rooms r ON r.id = ra.room_id
         JOIN buildings b ON b.id = r.building_id
         WHERE ra.user_id = $1 AND ra.is_active = TRUE
         LIMIT 1`,
        [user_id]
      );
      if (otherRoom.rows.length > 0) {
        const { room_number, building_name } = otherRoom.rows[0];
        return res.status(400).json({
          success: false,
          message: `Bu öğrenci zaten ${building_name} - ${room_number} odasında kayıtlı. Önce o odadan çıkarın.`
        });
      }

      // Yeni atama ekle
      await pool.query(
        `INSERT INTO room_assignments (user_id, room_id, assigned_by, start_date, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), TRUE, NOW(), NOW())`,
        [user_id, roomId, req.user.id]
      );

      // Doluluk güncelle
      const newOcc = room.current_occupancy + 1;
      const newStatus = newOcc >= room.capacity ? 'Dolu' : 'Kısmi';
      await pool.query(
        'UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [newOcc, newStatus, roomId]
      );

      res.json({ success: true, message: "Öğrenci odaya eklendi" });
    } catch (err) {
      console.error("Atama hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /rooms/:id/residents/:userId
// Öğrenciyi odadan çıkar
// ------------------------------------
router.delete("/:id/residents/:userId",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const roomId  = req.params.id;
    const userId  = req.params.userId;

    try {
      const asgn = await pool.query(
        'SELECT id FROM room_assignments WHERE room_id = $1 AND user_id = $2 AND is_active = TRUE',
        [roomId, userId]
      );
      if (asgn.rows.length === 0)
        return res.status(404).json({ success: false, message: "Aktif atama bulunamadı" });

      // Atamayı pasif yap
      await pool.query(
        'UPDATE room_assignments SET is_active = FALSE, end_date = NOW(), updated_at = NOW() WHERE room_id = $1 AND user_id = $2 AND is_active = TRUE',
        [roomId, userId]
      );

      // Doluluk güncelle
      const roomRes = await pool.query(
        'SELECT current_occupancy, capacity FROM rooms WHERE id = $1',
        [roomId]
      );
      if (roomRes.rows.length > 0) {
        const newOcc = Math.max(0, roomRes.rows[0].current_occupancy - 1);
        const capacity = roomRes.rows[0].capacity;
        const newStatus = newOcc === 0 ? 'Boş' : newOcc >= capacity ? 'Dolu' : 'Kısmi';
        await pool.query(
          'UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3',
          [newOcc, newStatus, roomId]
        );
      }

      res.json({ success: true, message: "Öğrenci odadan çıkarıldı" });
    } catch (err) {
      console.error("Çıkarma hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PUT /rooms/:id
// Oda numarası ve kapasitesini günceller (Sadece Yönetici)
// Yeni kapasite mevcut sakin sayısından küçük olamaz
// ------------------------------------
router.put("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const roomId = req.params.id;
    const { room_number, capacity } = req.body || {};

    if (!room_number && !capacity) {
      return res.status(400).json({ success: false, message: "Güncellenecek alan gerekli" });
    }

    try {
      const roomRes = await pool.query(
        'SELECT * FROM rooms WHERE id = $1 AND is_active = TRUE',
        [roomId]
      );
      if (roomRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Oda bulunamadı" });
      }
      const room = roomRes.rows[0];

      // Gerçek doluluk sayısını room_assignments'tan al
      const occRes = await pool.query(
        'SELECT COUNT(*) AS cnt FROM room_assignments WHERE room_id = $1 AND is_active = TRUE',
        [roomId]
      );
      const realOcc = parseInt(occRes.rows[0].cnt) || 0;

      const newCapacity   = capacity ? parseInt(capacity) : room.capacity;
      const newRoomNumber = room_number || room.room_number;

      if (newCapacity < realOcc) {
        return res.status(400).json({
          success: false,
          message: `Yeni kapasite (${newCapacity}) mevcut sakin sayısından (${realOcc}) küçük olamaz`
        });
      }

      const newStatus = realOcc === 0 ? 'Boş' : realOcc >= newCapacity ? 'Dolu' : 'Kısmi';
      await pool.query(
        'UPDATE rooms SET room_number = $1, capacity = $2, status = $3, updated_at = NOW() WHERE id = $4',
        [newRoomNumber, newCapacity, newStatus, roomId]
      );

      res.json({ success: true, message: "Oda güncellendi" });
    } catch (err) {
      console.error("Oda güncelleme hatası:", err);
      if (err.code === '23505') {
        return res.status(400).json({ success: false, message: "Bu oda numarası zaten mevcut" });
      }
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /rooms/:id
// Odayı siler — içinde aktif sakin varsa hata döner (Sadece Yönetici)
// ------------------------------------
router.delete("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const roomId = req.params.id;

    try {
      const roomRes = await pool.query(
        'SELECT id, room_number FROM rooms WHERE id = $1 AND is_active = TRUE',
        [roomId]
      );
      if (roomRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Oda bulunamadı" });
      }

      // Aktif sakin var mı kontrol et
      const occRes = await pool.query(
        'SELECT COUNT(*) AS cnt FROM room_assignments WHERE room_id = $1 AND is_active = TRUE',
        [roomId]
      );
      if (parseInt(occRes.rows[0].cnt) > 0) {
        return res.status(400).json({
          success: false,
          message: "Odada aktif sakin var, önce öğrencileri çıkarın"
        });
      }

      // Soft-delete
      await pool.query(
        'UPDATE rooms SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
        [roomId]
      );

      res.json({ success: true, message: "Oda silindi" });
    } catch (err) {
      console.error("Oda silme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
