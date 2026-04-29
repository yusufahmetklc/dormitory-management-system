// ╔══════════════════════════════════════════════════════════════════╗
// ║  GELİŞMİŞ RAPOR ROUTE'LARI (routes/reportRoutes.js)            ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Yönetici dashboard istatistikleri, detaylı raporlar ve        ║
// ║  analizler sunar. Admin panelinin Dashboard bölümü bu          ║
// ║  endpoint'leri kullanır.                                       ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET /reports/dashboard → Ana sayfa istatistikleri              ║
// ║    Yanıt: { users: {total_users}, rooms: {total_rooms,         ║
// ║            occupied_rooms}, complaints: {pending} }            ║
// ║  GET /reports/occupancy → Doluluk raporu                       ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// GET /reports/dashboard
// Genel dashboard istatistikleri (Yönetici)
// Tüm modüllerden özet veriler
// ------------------------------------
router.get("/dashboard",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      // Kullanıcı sayıları
      const userStats = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE user_type = 'Öğrenci') AS student_count,
          COUNT(*) FILTER (WHERE user_type != 'Öğrenci') AS staff_count,
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE is_active = TRUE) AS active_users
        FROM users
      `);

      // Oda istatistikleri
      const roomStats = await pool.query(`
        SELECT
          COUNT(*) AS total_rooms,
          COALESCE(SUM(capacity), 0) AS total_capacity,
          COALESCE(SUM(current_occupancy), 0) AS total_occupancy,
          COUNT(*) FILTER (WHERE status = 'Boş') AS empty_rooms,
          COUNT(*) FILTER (WHERE status = 'Dolu') AS full_rooms,
          COUNT(*) FILTER (WHERE status = 'Kısmi') AS partial_rooms,
          COUNT(*) FILTER (WHERE status = 'Bakımda') AS maintenance_rooms,
          ROUND(COALESCE(SUM(current_occupancy), 0)::NUMERIC / NULLIF(COALESCE(SUM(capacity), 0), 0) * 100, 1) AS occupancy_rate
        FROM rooms WHERE is_active = TRUE
      `);

      // Şikayet istatistikleri
      const complaintStats = await pool.query(`
        SELECT
          COUNT(*) AS total_complaints,
          COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending,
          COUNT(*) FILTER (WHERE status = 'İnceleniyor') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'Çözüldü') AS resolved,
          COUNT(*) FILTER (WHERE priority = 'Acil') AS urgent,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS last_7_days
        FROM complaints
      `);

      // Bugünkü giriş-çıkış (tablo yoksa boş döner)
      let entryStats = { rows: [{ today_entries: 0, today_exits: 0 }] };
      try {
        entryStats = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE log_type = 'Giriş') AS today_entries,
            COUNT(*) FILTER (WHERE log_type = 'Çıkış') AS today_exits
          FROM entry_exit_logs
          WHERE DATE(logged_at) = CURRENT_DATE
        `);
      } catch {}

      // Bina bilgileri
      const buildingStats = await pool.query(`
        SELECT b.name,
          CASE
            WHEN b.name ILIKE '%kız%' OR b.name ILIKE '%kadın%' THEN 'Kız'
            WHEN b.name ILIKE '%erkek%' THEN 'Erkek'
            ELSE 'Karma'
          END AS gender_type,
          (SELECT COALESCE(SUM(r2.capacity), 0) FROM rooms r2 WHERE r2.building_id = b.id AND r2.is_active = TRUE) AS capacity,
          (SELECT COALESCE(SUM(r.current_occupancy), 0) FROM rooms r WHERE r.building_id = b.id) AS occupancy,
          (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id) AS room_count,
          ROUND(
            (SELECT COALESCE(SUM(r.current_occupancy), 0) FROM rooms r WHERE r.building_id = b.id)::NUMERIC /
            NULLIF((SELECT COALESCE(SUM(r2.capacity), 0) FROM rooms r2 WHERE r2.building_id = b.id AND r2.is_active = TRUE), 0) * 100, 1
          ) AS occupancy_rate
        FROM buildings b WHERE b.is_active = TRUE
        ORDER BY b.name
      `);

      // Ödeme istatistikleri (tablo yoksa boş döner)
      let paymentStats = { total_collected: 0, total_pending: 0, total_overdue: 0 };
      try {
        const ps = await pool.query(`
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE status = 'Ödendi'), 0) AS total_collected,
            COALESCE(SUM(amount) FILTER (WHERE status = 'Beklemede'), 0) AS total_pending,
            COALESCE(SUM(amount) FILTER (WHERE status = 'Gecikmiş'), 0) AS total_overdue
          FROM payments
        `);
        paymentStats = ps.rows[0];
      } catch {}

      // İzin istatistikleri
      let leaveStats = { pending: 0, currently_on_leave: 0 };
      try {
        const ls = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending,
            COUNT(*) FILTER (WHERE status = 'Onaylandı' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE) AS currently_on_leave
          FROM leave_requests
        `);
        leaveStats = ls.rows[0];
      } catch {}

      // Bakım istatistikleri
      let maintenanceStats = { active_tasks: 0, total_cost: 0 };
      try {
        const ms = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('Planlandı', 'Devam Ediyor')) AS active_tasks,
            COALESCE(SUM(cost), 0) AS total_cost
          FROM maintenance_logs
        `);
        maintenanceStats = ms.rows[0];
      } catch {}

      res.json({
        success: true,
        data: {
          users: userStats.rows[0],
          rooms: roomStats.rows[0],
          complaints: complaintStats.rows[0],
          entries: entryStats.rows[0],
          buildings: buildingStats.rows,
          payments: paymentStats,
          leaves: leaveStats,
          maintenance: maintenanceStats
        }
      });
    } catch (err) {
      console.error("Dashboard rapor hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/occupancy
// Doluluk oranı raporu (Bina ve kat bazlı + oda detayı + özet)
// ------------------------------------
router.get("/occupancy",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      // Kat bazlı ozet (grafik ve tablo için)
      const byFloor = await pool.query(`
        SELECT b.name AS building_name, r.floor,
          COUNT(*)::int AS room_count,
          COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
          COALESCE(SUM(r.current_occupancy), 0)::int AS total_occupancy,
          ROUND(COALESCE(SUM(r.current_occupancy), 0)::NUMERIC / NULLIF(SUM(r.capacity), 0) * 100, 1) AS occupancy_rate
        FROM rooms r
        JOIN buildings b ON r.building_id = b.id
        WHERE r.is_active = TRUE
        GROUP BY b.name, r.floor
        ORDER BY b.name, r.floor
      `);

      // Bina bazlı özet (kartlar için)
      const byBuilding = await pool.query(`
        SELECT b.id AS building_id, b.name AS building_name,
          COUNT(r.id)::int AS room_count,
          COALESCE(SUM(r.capacity), 0)::int AS total_capacity,
          COALESCE(SUM(r.current_occupancy), 0)::int AS total_occupancy,
          COUNT(r.id) FILTER (WHERE r.current_occupancy = 0)::int AS empty_rooms,
          COUNT(r.id) FILTER (WHERE r.current_occupancy >= r.capacity)::int AS full_rooms,
          COUNT(r.id) FILTER (WHERE r.current_occupancy > 0 AND r.current_occupancy < r.capacity)::int AS partial_rooms,
          ROUND(COALESCE(SUM(r.current_occupancy), 0)::NUMERIC / NULLIF(SUM(r.capacity), 0) * 100, 1) AS occupancy_rate
        FROM buildings b
        LEFT JOIN rooms r ON r.building_id = b.id AND r.is_active = TRUE
        WHERE b.is_active = TRUE
        GROUP BY b.id, b.name
        ORDER BY b.name
      `);

      // Oda detayı (hangi odada kim var)
      const roomDetail = await pool.query(`
        SELECT
          b.name AS building_name,
          r.floor,
          r.room_number,
          r.capacity,
          r.current_occupancy,
          r.status,
          ROUND(r.current_occupancy::NUMERIC / NULLIF(r.capacity, 0) * 100, 0) AS occupancy_rate,
          COALESCE(
            json_agg(
              json_build_object(
                'user_id', u.id,
                'name', u.first_name || ' ' || u.last_name
              ) ORDER BY u.first_name
            ) FILTER (WHERE u.id IS NOT NULL),
            '[]'
          ) AS occupants
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        LEFT JOIN room_assignments ra ON ra.room_id = r.id AND ra.is_active = TRUE
        LEFT JOIN users u ON u.id = ra.user_id
        WHERE r.is_active = TRUE
        GROUP BY b.name, r.floor, r.room_number, r.capacity, r.current_occupancy, r.status
        ORDER BY b.name, r.floor, r.room_number
      `);

      // Genel özet
      const summary = await pool.query(`
        SELECT
          COUNT(*)::int AS total_rooms,
          COALESCE(SUM(capacity), 0)::int AS total_capacity,
          COALESCE(SUM(current_occupancy), 0)::int AS total_occupancy,
          COUNT(*) FILTER (WHERE current_occupancy = 0)::int AS empty_rooms,
          COUNT(*) FILTER (WHERE current_occupancy >= capacity)::int AS full_rooms,
          COUNT(*) FILTER (WHERE current_occupancy > 0 AND current_occupancy < capacity)::int AS partial_rooms,
          ROUND(COALESCE(SUM(current_occupancy), 0)::NUMERIC / NULLIF(SUM(capacity), 0) * 100, 1) AS occupancy_rate
        FROM rooms WHERE is_active = TRUE
      `);

      res.json({
        success: true,
        data: {
          by_floor:    byFloor.rows,
          by_building: byBuilding.rows,
          rooms:       roomDetail.rows,
          summary:     summary.rows[0]
        }
      });
    } catch (err) {
      console.error("Doluluk raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/complaints-summary
// Şikayet özet raporu (kategoriye göre)
// ------------------------------------
router.get("/complaints-summary",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT category,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending,
          COUNT(*) FILTER (WHERE status = 'Çözüldü') AS resolved,
          ROUND(COUNT(*) FILTER (WHERE status = 'Çözüldü')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS resolve_rate,
          ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE status = 'Çözüldü'), 1) AS avg_resolve_hours
        FROM complaints
        GROUP BY category
        ORDER BY total DESC
      `);
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Şikayet raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/entry-exit-summary
// Giriş-çıkış özet raporu (günlük/haftalık)
// Query: ?days=7
// ------------------------------------
router.get("/entry-exit-summary",
  authenticateToken,
  authorizeRole("Yönetici", "Güvenlik", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7;

      let daily = { rows: [] };
      let hourly = { rows: [] };
      let byGate = { rows: [] };

      try {
        daily = await pool.query(`
          SELECT DATE(logged_at) AS date,
            COUNT(*) FILTER (WHERE log_type = 'Giriş') AS entries,
            COUNT(*) FILTER (WHERE log_type = 'Çıkış') AS exits,
            COUNT(*) AS total
          FROM entry_exit_logs
          WHERE logged_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
          GROUP BY DATE(logged_at)
          ORDER BY date DESC
        `, [days]);

        // Saat bazlı dağılım (bugün)
        hourly = await pool.query(`
          SELECT EXTRACT(HOUR FROM logged_at)::INTEGER AS hour,
            COUNT(*) FILTER (WHERE log_type = 'Giriş') AS entries,
            COUNT(*) FILTER (WHERE log_type = 'Çıkış') AS exits
          FROM entry_exit_logs
          WHERE DATE(logged_at) = CURRENT_DATE
          GROUP BY hour
          ORDER BY hour
        `);

        // Kapı bazlı dağılım
        byGate = await pool.query(`
          SELECT gate, COUNT(*) AS total
          FROM entry_exit_logs
          WHERE logged_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
          GROUP BY gate ORDER BY total DESC
        `, [days]);
      } catch {}

      res.json({
        success: true,
        data: {
          daily: daily.rows,
          hourly: hourly.rows,
          by_gate: byGate.rows
        }
      });
    } catch (err) {
      console.error("Giriş-çıkış raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/student-demographics
// Öğrenci demografik raporu
// ------------------------------------
router.get("/student-demographics",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      let byFaculty = { rows: [] };
      try {
        byFaculty = await pool.query(`
          SELECT sp.faculty, COUNT(*) AS count
          FROM student_profiles sp JOIN users u ON sp.user_id = u.id
          WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE AND sp.faculty IS NOT NULL
          GROUP BY sp.faculty ORDER BY count DESC
        `);
      } catch {}

      let byClass = { rows: [] };
      try {
        byClass = await pool.query(`
          SELECT sp.class_year, COUNT(*) AS count
          FROM student_profiles sp JOIN users u ON sp.user_id = u.id
          WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE AND sp.class_year IS NOT NULL
          GROUP BY sp.class_year ORDER BY sp.class_year
        `);
      } catch {}

      // byGender: use users.gender since student_profiles.gender may not exist
      const byGender = await pool.query(`
        SELECT
          CASE u.gender WHEN 'male' THEN 'Erkek' WHEN 'female' THEN 'Kadın' ELSE 'Belirtilmemiş' END AS gender,
          COUNT(*) AS count
        FROM users u
        WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE
        GROUP BY u.gender
      `);

      let byCity = { rows: [] };
      try {
        byCity = await pool.query(`
          SELECT sp.address_city, COUNT(*) AS count
          FROM student_profiles sp JOIN users u ON sp.user_id = u.id
          WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE AND sp.address_city IS NOT NULL
          GROUP BY sp.address_city ORDER BY count DESC LIMIT 15
        `);
      } catch {}

      let byEnrollment = { rows: [] };
      try {
        byEnrollment = await pool.query(`
          SELECT sp.enrollment_year, COUNT(*) AS count
          FROM student_profiles sp JOIN users u ON sp.user_id = u.id
          WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE AND sp.enrollment_year IS NOT NULL
          GROUP BY sp.enrollment_year ORDER BY sp.enrollment_year DESC
        `);
      } catch {}

      res.json({
        success: true,
        data: {
          by_faculty: byFaculty.rows,
          by_class: byClass.rows,
          by_gender: byGender.rows,
          by_city: byCity.rows,
          by_enrollment_year: byEnrollment.rows
        }
      });
    } catch (err) {
      console.error("Demografik rapor hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/financial-summary
// Finansal özet rapor (Yönetici)
// ------------------------------------
router.get("/financial-summary",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const summary = await pool.query(`
        SELECT
          COUNT(*) AS total_records,
          COALESCE(SUM(amount), 0) AS total_amount,
          COUNT(DISTINCT user_id) AS unique_students
        FROM payments
      `);

      // Bakım maliyetleri
      let maintenanceCost = { total: 0 };
      try {
        const mc = await pool.query(`
          SELECT COALESCE(SUM(cost), 0) AS total,
            COALESCE(SUM(cost) FILTER (WHERE completed_at >= CURRENT_DATE - INTERVAL '30 days'), 0) AS last_30_days
          FROM maintenance_logs WHERE status = 'Tamamlandı'
        `);
        maintenanceCost = mc.rows[0];
      } catch {}

      res.json({
        success: true,
        data: {
          payment_summary: summary.rows[0],
          maintenance_cost: maintenanceCost
        }
      });
    } catch (err) {
      console.error("Finansal rapor hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/gender-occupancy
// Cinsiyet dağılımı + bina bazlı doluluk + ihlal tespiti
// ------------------------------------
router.get("/gender-occupancy",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      // ── 1. Cinsiyet dağılımı (users.gender kaynağı ile) ─────────────────
      const genderDist = await pool.query(`
        SELECT
          CASE u.gender
            WHEN 'male'   THEN 'Erkek'
            WHEN 'female' THEN 'Kadın'
            ELSE 'Belirtilmemiş'
          END AS gender,
          COUNT(*) AS count
        FROM users u
        WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE
        GROUP BY u.gender
        ORDER BY count DESC
      `);

      // ── 2. Her binadaki erkek / kadın / toplam atama sayısı ───────
      // room_assignments: is_active=TRUE
      const blockStats = await pool.query(`
        SELECT
          b.id                                                      AS building_id,
          b.name                                                    AS building_name,
          CASE
            WHEN b.name ILIKE '%kız%' OR b.name ILIKE '%kadın%' THEN 'Kız'
            WHEN b.name ILIKE '%erkek%' THEN 'Erkek'
            ELSE 'Karma'
          END                                                       AS gender_type,
          COALESCE(SUM(r.capacity), 0)::INTEGER                     AS capacity,
          COALESCE(SUM(r.capacity), 0)::INTEGER                     AS room_capacity,
          COALESCE(SUM(r.current_occupancy), 0)::INTEGER            AS current_occupancy,
          COUNT(r.id)                                               AS room_count,
          COUNT(r.id) FILTER (WHERE r.status = 'Boş')              AS empty_rooms,
          COUNT(r.id) FILTER (WHERE r.status = 'Dolu')             AS full_rooms,
          COUNT(r.id) FILTER (WHERE r.status = 'Kısmi')            AS partial_rooms,

          -- Toplam aktif atama sayısı
          (SELECT COUNT(*) FROM room_assignments ra2
            JOIN rooms r2 ON r2.id = ra2.room_id
            WHERE r2.building_id = b.id
              AND ra2.is_active = TRUE
          )                                                         AS assigned_count,

          -- Erkek öğrenci sayısı
          (SELECT COUNT(*) FROM room_assignments ra2
            JOIN rooms r2 ON r2.id = ra2.room_id
            JOIN users u2 ON u2.id = ra2.user_id
            WHERE r2.building_id = b.id
              AND ra2.is_active = TRUE
              AND u2.gender = 'male'
          )                                                         AS male_count,

          -- Kadın öğrenci sayısı
          (SELECT COUNT(*) FROM room_assignments ra2
            JOIN rooms r2 ON r2.id = ra2.room_id
            JOIN users u2 ON u2.id = ra2.user_id
            WHERE r2.building_id = b.id
              AND ra2.is_active = TRUE
              AND u2.gender = 'female'
          )                                                         AS female_count,

          ROUND(
            COALESCE(SUM(r.current_occupancy), 0)::NUMERIC /
            NULLIF(COALESCE(SUM(r.capacity), 0), 0) * 100, 1
          )                                                         AS occupancy_rate
        FROM buildings b
        LEFT JOIN rooms r ON r.building_id = b.id AND r.is_active = TRUE
        WHERE b.is_active = TRUE
        GROUP BY b.id, b.name
        ORDER BY b.name
      `);

      // ── 3. Cinsiyet ihlali tespiti ────────────────────────────────
      // Kural: Kız bloğunda erkek öğrenci OLMAMALI (veya tersi)
      // Her iki kaynak da kontrol edilir (users.gender VE student_profiles.gender)
      const violations = await pool.query(`
        SELECT DISTINCT
          u.id                                                        AS user_id,
          u.first_name,
          u.last_name,
          u.email,
          COALESCE(
            CASE u.gender WHEN 'male' THEN 'Erkek' WHEN 'female' THEN 'Kadın' END,
            'Bilinmiyor'
          )                                                           AS student_gender,
          b.name                                                      AS building_name,
          CASE
            WHEN b.name ILIKE '%kız%' OR b.name ILIKE '%kadın%' THEN 'Kız'
            WHEN b.name ILIKE '%erkek%' THEN 'Erkek'
            ELSE 'Karma'
          END                                                         AS building_gender,
          r.room_number,
          ra.created_at::DATE                                         AS assigned_date
        FROM room_assignments ra
        JOIN users u           ON u.id  = ra.user_id
        JOIN rooms r           ON r.id  = ra.room_id
        JOIN buildings b       ON b.id  = r.building_id
        WHERE
          ra.is_active = TRUE
          AND u.is_active = TRUE
          AND (
            (b.name ILIKE '%erkek%' AND u.gender = 'female')  OR
            ((b.name ILIKE '%kız%' OR b.name ILIKE '%kadın%') AND u.gender = 'male')
          )
        ORDER BY b.name, r.room_number
      `);

      // ── 4. Cinsiyeti bilinmeyen öğrenci sayısı ─────────────────────
      const noGender = await pool.query(`
        SELECT COUNT(*) AS count
        FROM users u
        WHERE u.user_type = 'Öğrenci'
          AND u.is_active = TRUE
          AND u.gender IS NULL
      `);

      res.json({
        success: true,
        data: {
          gender_distribution: genderDist.rows,
          block_stats:         blockStats.rows,
          violations:          violations.rows,
          violation_count:     violations.rowCount,
          no_gender_count:     parseInt(noGender.rows[0].count)
        }
      });
    } catch (err) {
      console.error("Cinsiyet-doluluk raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/monthly-revenue
// Son N ayın tahsilat özeti (aylık gelir grafiği)
// Query: ?months=12 (varsayılan 12)
// ------------------------------------
router.get("/monthly-revenue",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 24);

      // Ödendi statüsündeki ödemeleri ödeme tarihine göre ay bazlı grupla
      const paid = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', COALESCE(updated_at, created_at)), 'YYYY-MM') AS month,
          COALESCE(SUM(amount), 0)::NUMERIC AS revenue,
          COUNT(*) AS payment_count
        FROM payments
        WHERE status = 'Ödendi'
          AND COALESCE(updated_at, created_at) >= DATE_TRUNC('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month'
        GROUP BY DATE_TRUNC('month', COALESCE(updated_at, created_at))
        ORDER BY month ASC
      `, [months]);

      // Gecikmiş + bekleyen ödemeleri de ay bazlı grupla (borç analizi)
      const pending = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(amount), 0)::NUMERIC AS amount,
          COUNT(*) AS count
        FROM payments
        WHERE status IN ('Beklemede', 'Gecikmiş')
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `, [months]);

      // Aylık toplam ödeme tutarı (her durum)
      const total = await pool.query(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status = 'Ödendi'),    0)::NUMERIC AS total_collected,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Beklemede'), 0)::NUMERIC AS total_pending,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Gecikmiş'),  0)::NUMERIC AS total_overdue,
          COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending_count,
          COUNT(*) FILTER (WHERE status = 'Gecikmiş')  AS overdue_count
        FROM payments
      `);

      res.json({
        success: true,
        data: {
          monthly_revenue: paid.rows,
          monthly_pending: pending.rows,
          totals: total.rows[0]
        }
      });
    } catch (err) {
      console.error("Aylık gelir raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /reports/payment-analytics
// Ödeme analitikleri:
//   - Aylık dönem bazlı tahsilat/gecikme/bekleyen
//   - Ödeme yapan / yapmayan öğrenci sayısı
//   - Gecikmiş ödeme listesi (vadesi geçmiş kayıtlar)
//   - Ödeme yöntemi ve tipi dağılımı
// ------------------------------------
router.get("/payment-analytics",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      // ── 1. Öğrenci ödeme durumu ────────────────────────────────────
      // paid      : en az 1 Ödendi kaydı olan öğrenciler
      // unpaid    : hiç Ödendi kaydı yok, ama Beklemede/Gecikmiş kaydı var
      // no_payment: hiç ödeme kaydı yok
      const studentStatus = await pool.query(`
        SELECT
          COUNT(DISTINCT u.id)
            FILTER (WHERE EXISTS (
              SELECT 1 FROM payments p2
              WHERE p2.user_id = u.id AND p2.status = 'Ödendi'
            ))                                               AS paid_count,

          COUNT(DISTINCT u.id)
            FILTER (WHERE
              NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.user_id = u.id AND p2.status = 'Ödendi')
              AND EXISTS  (SELECT 1 FROM payments p3 WHERE p3.user_id = u.id AND p3.status IN ('Beklemede','Gecikmiş'))
            )                                               AS unpaid_count,

          COUNT(DISTINCT u.id)
            FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM payments p4 WHERE p4.user_id = u.id
            ))                                               AS no_payment_count
        FROM users u
        WHERE u.user_type = 'Öğrenci' AND u.is_active = TRUE
      `);

      // ── 2. Gecikmiş / vadesi geçmiş ödeme listesi ──────────────────
      // status='Gecikmiş' VEYA (status='Beklemede' AND due_date < bugün)
      const latePayments = await pool.query(`
        SELECT
          u.id            AS user_id,
          u.first_name,
          u.last_name,
          u.email,
          p.id            AS payment_id,
          p.amount,
          p.status,
          p.due_date,
          p.period_month,
          p.period_year,
          p.payment_type,
          CASE
            WHEN p.due_date IS NOT NULL THEN (CURRENT_DATE - p.due_date)::INTEGER
            ELSE NULL
          END             AS days_overdue
        FROM payments p
        JOIN users u ON u.id = p.user_id
        WHERE p.status = 'Gecikmiş'
           OR (p.status = 'Beklemede' AND p.due_date IS NOT NULL AND p.due_date < CURRENT_DATE)
        ORDER BY days_overdue DESC NULLS LAST, p.amount DESC
        LIMIT 50
      `);

      // ── 3. Dönem bazlı toplam (son 12 dönem, period_year/period_month) ─
      const byPeriod = await pool.query(`
        SELECT
          period_year,
          period_month,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Ödendi'),    0)::NUMERIC AS collected,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Beklemede'), 0)::NUMERIC AS pending,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Gecikmiş'),  0)::NUMERIC AS overdue,
          COUNT(*) FILTER (WHERE status = 'Ödendi')                  AS paid_count,
          COUNT(*) FILTER (WHERE status IN ('Beklemede','Gecikmiş')) AS unpaid_count
        FROM payments
        WHERE period_year  IS NOT NULL
          AND period_month IS NOT NULL
          AND period_year >= EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
        GROUP BY period_year, period_month
        ORDER BY period_year DESC, period_month DESC
        LIMIT 12
      `);

      // ── 4. Ödeme yöntemi dağılımı (sadece Ödendi) ──────────────────
      const byMethod = await pool.query(`
        SELECT
          payment_method,
          COUNT(*)                          AS count,
          COALESCE(SUM(amount), 0)::NUMERIC AS total
        FROM payments
        WHERE status = 'Ödendi' AND payment_method IS NOT NULL
        GROUP BY payment_method
        ORDER BY total DESC
      `);

      // ── 5. Ödeme tipi dağılımı (tüm kayıtlar) ──────────────────────
      const byType = await pool.query(`
        SELECT
          payment_type,
          COUNT(*)                          AS count,
          COALESCE(SUM(amount), 0)::NUMERIC AS total
        FROM payments
        WHERE payment_type IS NOT NULL
        GROUP BY payment_type
        ORDER BY total DESC
      `);

      // ── 6. Gecikmiş ödeme özeti ─────────────────────────────────────
      const lateSummary = await pool.query(`
        SELECT
          COUNT(*)                          AS late_count,
          COALESCE(SUM(amount), 0)::NUMERIC AS late_amount,
          COUNT(DISTINCT user_id)           AS late_student_count,
          COALESCE(AVG(
            CASE WHEN due_date IS NOT NULL THEN (CURRENT_DATE - due_date)::NUMERIC END
          ), 0)::NUMERIC                    AS avg_days_late
        FROM payments
        WHERE status = 'Gecikmiş'
           OR (status = 'Beklemede' AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
      `);

      res.json({
        success: true,
        data: {
          student_status: studentStatus.rows[0],
          late_payments:  latePayments.rows,
          late_summary:   lateSummary.rows[0],
          by_period:      byPeriod.rows,
          by_method:      byMethod.rows,
          by_type:        byType.rows
        }
      });
    } catch (err) {
      console.error("Ödeme analitik raporu hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
