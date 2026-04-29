// ╔══════════════════════════════════════════════════════════════════╗
// ║  GELİŞMİŞ ÖĞRENCİ MODÜLÜ ROUTE'LARI (routes/studentRoutes.js) ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Öğrenci kayıt, profil, oda atama, transfer, belge ve          ║
// ║  disiplin işlemlerini yönetir.                                  ║
// ║                                                                  ║
// ║  ÖNEMLİ ENDPOINT'LER:                                          ║
// ║  GET  /students/profile     → Öğrencinin kendi profil bilgisi  ║
// ║  GET  /students/profile/:id → Belirli öğrencinin profili       ║
// ║  GET  /students/list        → Tüm öğrenci listesi (admin)     ║
// ║  POST /students/assign-room → Öğrenciyi odaya ata              ║
// ║                                                                  ║
// ║  NOT: /students/profile yanıtında oda bilgisi "room" objesi    ║
// ║  içinde gelir: { ...öğrenci, room: { room_number, ... } }      ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ============================================================
// ÖĞRENCİ DASHBOARD (TEK ENDPOINT)
// ============================================================

// ------------------------------------
// GET /students/dashboard
// Öğrencinin tüm özet verilerini tek seferde döner
// Profil, oda, giriş-çıkış, şikayet, izin, ödeme, duyuru, bildirim
// ------------------------------------
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    // 1. Oda bilgisi
    const roomResult = await pool.query(`
      SELECT r.room_number, r.capacity, r.floor AS floor_number,
             b.name AS building_name
      FROM room_assignments ra
      JOIN rooms r ON r.id = ra.room_id
      JOIN buildings b ON b.id = r.building_id
      WHERE ra.user_id = $1 AND ra.is_active = TRUE
      ORDER BY ra.id DESC
      LIMIT 1
    `, [req.user.id]);
    const room = roomResult.rows[0] || null;

    // 2. Ödeme özeti + aylık dağılım
    let payments = { total: 0, paid: 0, unpaid: 0, monthly: Array(12).fill(0) };
    try {
      const payResult = await pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS total,
          COALESCE(SUM(CASE WHEN status = 'Ödendi' THEN amount ELSE 0 END), 0) AS paid,
          COALESCE(SUM(CASE WHEN status IN ('Beklemede','Gecikmiş') THEN amount ELSE 0 END), 0) AS unpaid
        FROM payments
        WHERE user_id = $1
      `, [req.user.id]);

      const monthResult = await pool.query(`
        SELECT
          EXTRACT(MONTH FROM payment_date)::int AS month,
          COALESCE(SUM(amount), 0) AS total
        FROM payments
        WHERE user_id = $1
          AND status = 'Ödendi'
          AND payment_date IS NOT NULL
          AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM NOW())
        GROUP BY month
        ORDER BY month
      `, [req.user.id]);

      const monthly = Array(12).fill(0);
      monthResult.rows.forEach(r => { monthly[r.month - 1] = parseFloat(r.total); });

      payments = { ...payResult.rows[0], monthly };
    } catch (e) { console.error('Ödeme sorgu hatası:', e.message); }

    // 3. Son talepler
    let requests = [];
    try {
      const reqResult = await pool.query(`
        SELECT id,
               category AS type,
               CASE status
                 WHEN 'pending'     THEN 'Beklemede'
                 WHEN 'in_progress' THEN 'İnceleniyor'
                 WHEN 'approved'    THEN 'Çözüldü'
                 WHEN 'rejected'    THEN 'Reddedildi'
                 ELSE status END AS status,
               created_at
        FROM complaints
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [req.user.id]);
      requests = reqResult.rows;
    } catch { /* tablo yoksa boş dizi */ }

    // 4. Son duyurular (aktif olanlar — publish_at/expires_at JSON içinde)
    let announcements = [];
    try {
      const annResult = await pool.query(`
        SELECT title, content, created_at
        FROM announcements
        ORDER BY created_at DESC
        LIMIT 20
      `);
      const now = new Date();
      announcements = annResult.rows
        .map(row => {
          let text = row.content || '';
          let category = 'Genel';
          let publish_at = null;
          let expires_at = null;
          try {
            const p = JSON.parse(row.content);
            if (p && typeof p === 'object' && 'text' in p) {
              text = p.text || '';
              category = p.category || 'Genel';
              publish_at = p.publish_at || null;
              expires_at = p.expires_at || null;
            }
          } catch { /* eski format */ }
          return { title: row.title, content: text, category, publish_at, expires_at, created_at: row.created_at };
        })
        .filter(a => {
          if (a.publish_at && new Date(a.publish_at) > now) return false;
          if (a.expires_at && new Date(a.expires_at) <= now) return false;
          return true;
        })
        .slice(0, 3);
    } catch { /* tablo yoksa boş dizi */ }

    res.json({ room, payments, requests, announcements });
  } catch (err) {
    console.error("Öğrenci dashboard hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ──────────────────────────────────────────────
// (ESKİ GENİŞ DASHBOARD — AŞAĞIDA DEVAM EDER)
// ──────────────────────────────────────────────
router.get("/dashboard-full", authenticateToken, async (req, res) => {
  try {
    // 1. Profil bilgisi
    const profileResult = await pool.query(`
      SELECT u.id, u.email, u.user_type, u.first_name, u.last_name, u.username,
             sp.user_id AS sp_user_id, sp.created_at AS sp_created_at
      FROM public.users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    const dashboard = { profile: profileResult.rows[0] };

    // 2. Aktif oda ataması + bina bilgisi
    const roomResult = await pool.query(`
      SELECT ra.id AS assignment_id, ra.check_in_date, ra.status AS assignment_status,
             r.id AS room_id, r.room_number, r.floor, r.room_type,
             r.has_bathroom, r.has_balcony, r.has_ac, r.price_per_month,
             b.id AS building_id, b.name AS building_name
      FROM room_assignments ra
      JOIN rooms r ON ra.room_id = r.id
      JOIN buildings b ON r.building_id = b.id
      WHERE ra.user_id = $1 
      LIMIT 1
    `, [req.user.id]);
    dashboard.room = roomResult.rows[0] || null;

    // 3. Oda arkadaşları
    if (dashboard.room) {
      const roommates = await pool.query(`
        SELECT u.id, u.first_name, u.last_name, sp.phone, sp.faculty, sp.department, sp.class_year
        FROM room_assignments ra
        JOIN public.users u ON ra.user_id = u.id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE ra.room_id = $1 AND ra.user_id != $2
        ORDER BY u.first_name
      `, [dashboard.room.room_id, req.user.id]);
      dashboard.roommates = roommates.rows;
    } else {
      dashboard.roommates = [];
    }

    // 4. Son 10 giriş-çıkış kaydı
    dashboard.recent_entries = [];

    // 5. Şikayet/arıza bildirimlerinin özeti
    const complaintResult = await pool.query(`
      SELECT id, category, title, status, priority, created_at, response
      FROM complaints
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 10
    `, [req.user.id]);
    dashboard.complaints = complaintResult.rows;

    // 6. Şikayet istatistikleri
    try {
      const compStats = await pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Beklemede') AS pending,
          COUNT(*) FILTER (WHERE status = 'İnceleniyor') AS in_progress,
          COUNT(*) FILTER (WHERE status = 'Çözüldü') AS resolved
        FROM complaints WHERE user_id = $1
      `, [req.user.id]);
      dashboard.complaint_stats = compStats.rows[0];
    } catch { dashboard.complaint_stats = null; }

    // 7. İzin talepleri
    try {
      const leaveResult = await pool.query(`
        SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.reason,
               lr.destination, lr.status, lr.created_at,
               ap.first_name AS approver_first, ap.last_name AS approver_last
        FROM leave_requests lr
        LEFT JOIN public.users ap ON lr.approved_by = ap.id
        WHERE lr.user_id = $1
        ORDER BY lr.created_at DESC LIMIT 10
      `, [req.user.id]);
      dashboard.leaves = leaveResult.rows;
    } catch { dashboard.leaves = []; }

    // 8. Ödeme bilgileri
    try {
      const paymentResult = await pool.query(
        `SELECT id, user_id, amount, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12`,
        [req.user.id]
      );
      dashboard.payments = paymentResult.rows;
      dashboard.payment_stats = null;
    } catch {
      dashboard.payments = [];
      dashboard.payment_stats = null;
    }

    // 9. Ziyaretçi geçmişi
    dashboard.visitors = [];

    // 10. Duyurular
    try {
      const announcementResult = await pool.query(`
        SELECT a.id, a.title, a.content, a.created_at,
               u.first_name AS author_first, u.last_name AS author_last
        FROM announcements a
        LEFT JOIN public.users u ON a.created_by = u.id
        ORDER BY a.created_at DESC
        LIMIT 10
      `);
      dashboard.announcements = announcementResult.rows;
    } catch { dashboard.announcements = []; }

    // 11. Okunmamış bildirimler
    try {
      const notifResult = await pool.query(`
        SELECT id, title, message, notification_type, is_read, created_at
        FROM notification_logs
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 20
      `, [req.user.id]);
      dashboard.notifications = notifResult.rows;

      const unread = await pool.query(
        "SELECT COUNT(*) AS count FROM notification_logs WHERE user_id = $1 AND is_read = FALSE",
        [req.user.id]
      );
      dashboard.unread_notifications = parseInt(unread.rows[0].count);
    } catch {
      dashboard.notifications = [];
      dashboard.unread_notifications = 0;
    }

    // 12. Aktif uyarılar
    try {
      const warnings = await pool.query(`
        SELECT id, warning_type, reason, severity, incident_date, is_active
        FROM student_warnings
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC
      `, [req.user.id]);
      dashboard.warnings = warnings.rows;
    } catch { dashboard.warnings = []; }

    // 13. Transfer talepleri
    try {
      const transfers = await pool.query(`
        SELECT id, user_id, requested_room_id, reason, created_at
        FROM room_transfer_requests
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT 5
      `, [req.user.id]);
      dashboard.transfer_requests = transfers.rows;
    } catch { dashboard.transfer_requests = []; }

    // 14. Belgeler
    try {
      const docs = await pool.query(`
        SELECT id, document_type, file_name, status, created_at, expiry_date
        FROM student_documents
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [req.user.id]);
      dashboard.documents = docs.rows;
    } catch { dashboard.documents = []; }

    res.json(dashboard);
  } catch (err) {
    console.error("Öğrenci dashboard hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ============================================================
// ÖĞRENCİ PROFİL İŞLEMLERİ
// ============================================================

// ------------------------------------
// GET /students/profile
// Oturum açmış öğrencinin detaylı profili
// (oda bilgisi + öğrenci profili + oda arkadaşları)
// ------------------------------------
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.user_type, u.first_name, u.last_name, u.username,
             u.phone, u.faculty, u.department, u.gender,
             sp.user_id AS sp_user_id, sp.created_at AS sp_created_at
      FROM public.users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    const profile = result.rows[0];

    // Aktif oda ataması
    const roomResult = await pool.query(`
      SELECT ra.id AS assignment_id, ra.start_date AS check_in_date, ra.is_active,
             r.id AS room_id, r.room_number, r.floor AS floor_number, r.capacity,
             b.id AS building_id, b.name AS building_name
      FROM room_assignments ra
      JOIN rooms r ON ra.room_id = r.id
      JOIN buildings b ON r.building_id = b.id
      WHERE ra.user_id = $1 AND ra.is_active = TRUE
      ORDER BY ra.id DESC
      LIMIT 1
    `, [req.user.id]);

    profile.room = roomResult.rows[0] || null;

    // Oda arkadaşları
    if (roomResult.rows[0]) {
      const roommates = await pool.query(`
        SELECT u.id, u.first_name, u.last_name, u.phone, u.faculty, u.department
        FROM room_assignments ra
        JOIN public.users u ON ra.user_id = u.id
        WHERE ra.room_id = $1 AND ra.user_id != $2 AND ra.is_active = TRUE
        ORDER BY u.first_name
      `, [roomResult.rows[0].room_id, req.user.id]);
      profile.roommates = roommates.rows;
    } else {
      profile.roommates = [];
    }

    // Aktif uyarılar (tablo yoksa 0 döndür)
    try {
      const warnings = await pool.query(
        "SELECT COUNT(*) AS count FROM student_warnings WHERE user_id = $1 AND is_active = TRUE",
        [req.user.id]
      );
      profile.active_warnings = parseInt(warnings.rows[0].count);
    } catch { profile.active_warnings = 0; }

    // Bekleyen izin talepleri (tablo yoksa 0 döndür)
    try {
      const leaves = await pool.query(
        "SELECT COUNT(*) AS count FROM leave_requests WHERE user_id = $1 AND status = 'Beklemede'",
        [req.user.id]
      );
      profile.pending_leaves = parseInt(leaves.rows[0].count);
    } catch { profile.pending_leaves = 0; }

    const { room, roommates, active_warnings, pending_leaves, ...student } = profile;
    res.json({
      success: true,
      data: {
        student: { ...student, roommates, active_warnings, pending_leaves },
        room: room || null
      }
    });
  } catch (err) {
    console.error("Öğrenci profil hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /students/profile/:id
// Admin: belirli öğrencinin profili
// ------------------------------------
router.get("/profile/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ success: false, message: "Geçersiz kullanıcı ID" });

    try {
      const result = await pool.query(`
        SELECT u.id, u.email, u.user_type, u.first_name, u.last_name, u.username,
               sp.user_id AS sp_user_id, sp.room_id, sp.created_at AS sp_created_at
        FROM public.users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE u.id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Öğrenci bulunamadı" });
      }

      const student = result.rows[0];

      const room = await pool.query(`
        SELECT ra.id AS assignment_id, ra.check_in_date, ra.status AS assignment_status,
               r.id AS room_id, r.room_number, r.floor, r.room_type,
               r.has_bathroom, r.has_balcony, r.has_ac, r.price_per_month,
               b.id AS building_id, b.name AS building_name
        FROM room_assignments ra
        JOIN rooms r ON ra.room_id = r.id
        JOIN buildings b ON r.building_id = b.id
        WHERE ra.user_id = $1
        LIMIT 1
      `, [userId]);

      res.json({ success: true, data: { student, room: room.rows[0] || null } });
    } catch (err) {
      console.error("Öğrenci profil/:id hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PUT /students/profile
// Öğrenci kendi profilini günceller
// ------------------------------------
router.put("/profile", authenticateToken, async (req, res) => {
  const {
    phone, address_city, address_district, address_full,
    emergency_contact_name, emergency_contact_phone,
    guardian_name, guardian_phone, guardian_relation,
    chronic_diseases, allergies
  } = req.body;

  try {
    const exists = await pool.query(
      "SELECT id FROM student_profiles WHERE user_id = $1", [req.user.id]
    );

    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO student_profiles (user_id, phone, address_city, address_district, address_full,
          emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guardian_relation,
          chronic_diseases, allergies)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req.user.id, phone, address_city, address_district, address_full,
         emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guardian_relation,
         chronic_diseases, allergies]
      );
    } else {
      await pool.query(
        `UPDATE student_profiles SET
          phone=$2, address_city=$3, address_district=$4, address_full=$5,
          emergency_contact_name=$6, emergency_contact_phone=$7,
          guardian_name=$8, guardian_phone=$9, guardian_relation=$10,
          chronic_diseases=$11, allergies=$12, updated_at=NOW()
         WHERE user_id = $1`,
        [req.user.id, phone, address_city, address_district, address_full,
         emergency_contact_name, emergency_contact_phone, guardian_name, guardian_phone, guardian_relation,
         chronic_diseases, allergies]
      );
    }

    res.json({ message: "Profil güncellendi" });
  } catch (err) {
    console.error("Profil güncelleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ============================================================
// ÖĞRENCİ KAYIT İŞLEMLERİ (YÖNETİCİ)
// ============================================================

// ------------------------------------
// POST /students/register
// Yeni öğrenci kaydı oluşturur (Yönetici)
// Email + otomatik şifre ile hesap + profil bilgileri
// ------------------------------------
router.post("/register",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const {
      email, first_name, last_name, username,
      tc_no, birth_date, gender, phone,
      faculty, department, enrollment_year, class_year,
      blood_type, address_city, address_district, address_full,
      guardian_name, guardian_phone, guardian_relation,
      emergency_contact_name, emergency_contact_phone,
      room_id
    } = req.body;

    // Zorunlu alanlar
    if (!email || !first_name || !last_name) {
      return res.status(400).json({ success: false, message: "Email, ad ve soyad zorunlu" });
    }

    try {
      // Email benzersizlik kontrolü
      const emailCheck = await pool.query("SELECT id FROM public.users WHERE email = $1", [email]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı" });
      }

      // TC benzersizlik kontrolü
      if (tc_no) {
        const tcCheck = await pool.query("SELECT id FROM student_profiles WHERE tc_no = $1", [tc_no]);
        if (tcCheck.rows.length > 0) {
          return res.status(400).json({ success: false, message: "Bu TC kimlik numarası zaten kayıtlı" });
        }
      }

      // Varsayılan şifre
      const defaultPassword = `Yurt${new Date().getFullYear()}!`;
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      // Kullanıcı oluştur
      const userResult = await pool.query(
        `INSERT INTO public.users (email, password_hash, first_name, last_name, username, user_type, is_active, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, 'Öğrenci', TRUE, TRUE) RETURNING id`,
        [email, passwordHash, first_name, last_name, username || email.split('@')[0]]
      );

      const userId = userResult.rows[0].id;

      // Öğrenci profili oluştur
      await pool.query(
        `INSERT INTO student_profiles (user_id) VALUES ($1)`,
        [userId]
      );

      // Oda atama (isteğe bağlı)
      if (room_id) {
        const room = await pool.query(
          "SELECT capacity, current_occupancy FROM rooms WHERE id = $1", [room_id]
        );
        if (room.rows.length > 0 && room.rows[0].current_occupancy < room.rows[0].capacity) {
          await pool.query(
            "INSERT INTO room_assignments (user_id, room_id, assigned_by) VALUES ($1, $2, $3)",
            [userId, room_id, req.user.id]
          );
          const newOcc = room.rows[0].current_occupancy + 1;
          const newStatus = newOcc >= room.rows[0].capacity ? 'Dolu' : 'Kısmi';
          await pool.query(
            "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
            [newOcc, newStatus, room_id]
          );
        }
      }

      res.status(201).json({
        message: "Öğrenci kaydı oluşturuldu",
        user_id: userId,
        default_password: defaultPassword,
        note: "Öğrenciye varsayılan şifresini bildirin. İlk girişte değiştirmesi önerilir."
      });
    } catch (err) {
      console.error("Öğrenci kayıt hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// GET /students/list
// Tüm öğrencileri listeler (oda bilgisiyle — Yönetici)
// Query: ?building_id=1&room_id=5&search=Ali&faculty=Müh&page=1&limit=20
// ------------------------------------
router.get("/list",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {

      const result = await pool.query(`
        SELECT 
          id,
          first_name,
          last_name,
          email,
          is_active
        FROM public.users
        WHERE user_type = 'Student'
        ORDER BY last_name, first_name
      `);

      res.json({
        users: result.rows
      });

    } catch (err) {
      console.error("Öğrenci listeleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /students/stats
// Öğrenci genel istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const general = await pool.query(`
        SELECT
          COUNT(*) AS total_students,
          COUNT(*) FILTER (WHERE is_active = TRUE) AS active_students,
          COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_students
        FROM public.users WHERE user_type = 'Öğrenci'
      `);

      const rooms = await pool.query(`
        SELECT
          COUNT(DISTINCT ra.user_id) AS students_with_room,
          (SELECT COUNT(*) FROM public.users WHERE user_type = 'Öğrenci' AND is_active = TRUE) - COUNT(DISTINCT ra.user_id) AS students_without_room
        FROM room_assignments ra
        JOIN public.users u ON ra.user_id = u.id
        WHERE u.user_type = 'Student'
      `);

      const faculties = await pool.query(`
        SELECT sp.faculty, COUNT(*) AS count
        FROM student_profiles sp JOIN public.users u ON sp.user_id = u.id
        WHERE u.user_type = 'Student' AND sp.faculty IS NOT NULL
        GROUP BY sp.faculty ORDER BY count DESC
      `);

      const classYears = await pool.query(`
        SELECT sp.class_year, COUNT(*) AS count
        FROM student_profiles sp JOIN public.users u ON sp.user_id = u.id
        WHERE u.user_type = 'Student' AND sp.class_year IS NOT NULL
        GROUP BY sp.class_year ORDER BY sp.class_year
      `);

      res.json({
        general: general.rows[0],
        room_status: rooms.rows[0],
        by_faculty: faculties.rows,
        by_class_year: classYears.rows
      });
    } catch (err) {
      console.error("Öğrenci istatistik hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /students/:id/detail
// Tek öğrencinin tam detayı (Yönetici)
// ------------------------------------
router.get("/:id/detail",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const profile = await pool.query(`
        SELECT u.id, u.email, u.user_type, u.first_name, u.last_name, u.username, u.is_active,
               sp.user_id AS sp_user_id, sp.room_id, sp.created_at AS sp_created_at
        FROM public.users u
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE u.id = $1
      `, [req.params.id]);

      if (profile.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Öğrenci bulunamadı" });
      }

      const student = profile.rows[0];

      // Mevcut oda
      const room = await pool.query(`
        SELECT ra.*, r.room_number, r.floor, r.room_type, b.name AS building_name
        FROM room_assignments ra
        JOIN rooms r ON ra.room_id = r.id
        JOIN buildings b ON r.building_id = b.id
        WHERE ra.user_id = $1 LIMIT 1
      `, [req.params.id]);
      student.current_room = room.rows[0] || null;

      // Oda geçmişi
      const roomHistory = await pool.query(`
        SELECT ra.check_in_date, ra.check_out_date, ra.status,
               r.room_number, b.name AS building_name
        FROM room_assignments ra
        JOIN rooms r ON ra.room_id = r.id
        JOIN buildings b ON r.building_id = b.id
        WHERE ra.user_id = $1
        ORDER BY ra.created_at DESC LIMIT 10
      `, [req.params.id]);
      student.room_history = roomHistory.rows;

      student.recent_entries = [];

      // Ödeme durumu
      try {
        const payments = await pool.query(
          `SELECT id, user_id, amount, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
          [req.params.id]
        );
        student.payment_summary = payments.rows;
      } catch { student.payment_summary = []; }

      // Disiplin kayıtları
      try {
        const warnings = await pool.query(`
          SELECT sw.*, iu.first_name AS issuer_first, iu.last_name AS issuer_last
          FROM student_warnings sw JOIN users iu ON sw.issued_by = iu.id
          WHERE sw.user_id = $1 ORDER BY sw.created_at DESC
        `, [req.params.id]);
        student.warnings = warnings.rows;
      } catch { student.warnings = []; }

      // Belgeler
      try {
        const documents = await pool.query(`
          SELECT id, document_type, file_name, status, created_at, expiry_date
          FROM student_documents WHERE user_id = $1 ORDER BY created_at DESC
        `, [req.params.id]);
        student.documents = documents.rows;
      } catch { student.documents = []; }

      res.json(student);
    } catch (err) {
      console.error("Öğrenci detay hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /students/:id/profile
// Yönetici öğrenci profilini günceller
// ------------------------------------
router.patch("/:id/profile",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const fields = req.body;
    const allowedFields = ['room_id'];

    const setClauses = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        params.push(fields[field]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: "Güncellenecek alan belirtilmedi" });
    }

    params.push(req.params.id);

    try {
      const exists = await pool.query("SELECT id FROM student_profiles WHERE user_id = $1", [req.params.id]);
      if (exists.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Öğrenci profili bulunamadı" });
      }

      await pool.query(
        `UPDATE student_profiles SET ${setClauses.join(', ')} WHERE user_id = $${idx}`,
        params
      );

      if (fields.first_name) {
        await pool.query("UPDATE users SET first_name = $1 WHERE id = $2", [fields.first_name, req.params.id]);
      }
      if (fields.last_name) {
        await pool.query("UPDATE users SET last_name = $1 WHERE id = $2", [fields.last_name, req.params.id]);
      }

      res.json({ message: "Öğrenci profili güncellendi" });
    } catch (err) {
      console.error("Profil güncelleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ============================================================
// ODA ATAMA İŞLEMLERİ
// ============================================================

// ------------------------------------
// POST /students/assign-room
// Öğrenciye oda atar (Yönetici)
// Body: { user_id, room_id, notes }
// ------------------------------------
router.post("/assign-room",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, room_id, notes } = req.body;

    if (!user_id || !room_id) {
      return res.status(400).json({ success: false, message: "user_id ve room_id zorunlu" });
    }

    try {
      const existing = await pool.query(
        "SELECT id, room_id FROM room_assignments WHERE user_id = $1 AND status = 'Aktif'",
        [user_id]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          message: "Bu öğrencinin zaten aktif bir oda ataması var. Önce mevcut atamayı sonlandırın veya transfer yapın."
        });
      }

      const room = await pool.query(
        "SELECT capacity, current_occupancy, status FROM rooms WHERE id = $1 AND is_active = TRUE", [room_id]
      );

      if (room.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Oda bulunamadı veya aktif değil" });
      }
      if (room.rows[0].current_occupancy >= room.rows[0].capacity) {
        return res.status(400).json({ success: false, message: "Oda kapasitesi dolu" });
      }
      if (room.rows[0].status === 'Bakımda' || room.rows[0].status === 'Kapalı') {
        return res.status(400).json({ success: false, message: "Oda bakımda veya kapalı, atama yapılamaz" });
      }

      await pool.query(
        `INSERT INTO room_assignments (user_id, room_id, assigned_by, notes) VALUES ($1, $2, $3, $4)`,
        [user_id, room_id, req.user.id, notes]
      );

      const newOcc = room.rows[0].current_occupancy + 1;
      const newStatus = newOcc >= room.rows[0].capacity ? 'Dolu' : 'Kısmi';
      await pool.query(
        "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
        [newOcc, newStatus, room_id]
      );

      res.status(201).json({ message: "Oda ataması yapıldı" });
    } catch (err) {
      console.error("Oda atama hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /students/unassign-room
// Öğrenciyi odadan çıkarır (Yönetici)
// Body: { user_id, reason }
// ------------------------------------
router.post("/unassign-room",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, reason } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id zorunlu" });
    }

    try {
      const assignment = await pool.query(
        "SELECT id, room_id FROM room_assignments WHERE user_id = $1 AND status = 'Aktif'",
        [user_id]
      );

      if (assignment.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Aktif oda ataması bulunamadı" });
      }

      const roomId = assignment.rows[0].room_id;

      await pool.query(
        "UPDATE room_assignments SET status = 'Çıkış', check_out_date = CURRENT_DATE, notes = COALESCE(notes || ' | ', '') || $2, updated_at = NOW() WHERE id = $1",
        [assignment.rows[0].id, reason || 'Yönetici tarafından çıkarıldı']
      );

      const room = await pool.query("SELECT current_occupancy FROM rooms WHERE id = $1", [roomId]);
      const newOcc = Math.max(0, room.rows[0].current_occupancy - 1);
      const newStatus = newOcc === 0 ? 'Boş' : 'Kısmi';
      await pool.query(
        "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
        [newOcc, newStatus, roomId]
      );

      res.json({ message: "Öğrenci odadan çıkarıldı" });
    } catch (err) {
      console.error("Oda çıkarma hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /students/transfer-room
// Öğrenciyi bir odadan diğerine transfer eder (Yönetici)
// Body: { user_id, new_room_id, reason }
// ------------------------------------
router.post("/transfer-room",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, new_room_id, reason } = req.body;

    if (!user_id || !new_room_id) {
      return res.status(400).json({ success: false, message: "user_id ve new_room_id zorunlu" });
    }

    try {
      const currentAssignment = await pool.query(
        "SELECT id, room_id FROM room_assignments WHERE user_id = $1 AND status = 'Aktif'",
        [user_id]
      );

      if (currentAssignment.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Öğrencinin mevcut aktif oda ataması bulunamadı" });
      }

      const oldRoomId = currentAssignment.rows[0].room_id;

      if (oldRoomId === parseInt(new_room_id)) {
        return res.status(400).json({ success: false, message: "Öğrenci zaten bu odada" });
      }

      const newRoom = await pool.query(
        "SELECT capacity, current_occupancy, status FROM rooms WHERE id = $1 AND is_active = TRUE", [new_room_id]
      );

      if (newRoom.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Yeni oda bulunamadı" });
      }
      if (newRoom.rows[0].current_occupancy >= newRoom.rows[0].capacity) {
        return res.status(400).json({ success: false, message: "Yeni oda kapasitesi dolu" });
      }
      if (['Bakımda', 'Kapalı'].includes(newRoom.rows[0].status)) {
        return res.status(400).json({ success: false, message: "Yeni oda bakımda veya kapalı" });
      }

      // 1. Eski atamayı kapat
      await pool.query(
        "UPDATE room_assignments SET status = 'Transfer', check_out_date = CURRENT_DATE, notes = $2, updated_at = NOW() WHERE id = $1",
        [currentAssignment.rows[0].id, reason || 'Oda transfer']
      );

      // 2. Eski oda doluluk güncelle
      const oldRoom = await pool.query("SELECT current_occupancy FROM rooms WHERE id = $1", [oldRoomId]);
      const oldOcc = Math.max(0, oldRoom.rows[0].current_occupancy - 1);
      await pool.query(
        "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
        [oldOcc, oldOcc === 0 ? 'Boş' : 'Kısmi', oldRoomId]
      );

      // 3. Yeni atama oluştur
      await pool.query(
        "INSERT INTO room_assignments (user_id, room_id, assigned_by, notes) VALUES ($1, $2, $3, $4)",
        [user_id, new_room_id, req.user.id, `Transfer: ${reason || 'Yönetici kararı'}`]
      );

      // 4. Yeni oda doluluk güncelle
      const newOcc = newRoom.rows[0].current_occupancy + 1;
      await pool.query(
        "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
        [newOcc, newOcc >= newRoom.rows[0].capacity ? 'Dolu' : 'Kısmi', new_room_id]
      );

      res.json({ message: "Oda transferi tamamlandı" });
    } catch (err) {
      console.error("Oda transfer hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ============================================================
// ODA TRANSFER TALEPLERİ (ÖĞRENCİ)
// ============================================================

// ------------------------------------
// POST /students/transfer-request
// Öğrenci oda değişikliği talebi oluşturur
// ------------------------------------
router.post("/transfer-request", authenticateToken, async (req, res) => {
  const { requested_room_id, reason } = req.body;

  if (!reason) {
    return res.status(400).json({ success: false, message: "Gereçe zorunlu" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO room_transfer_requests (user_id, requested_room_id, reason) VALUES ($1, $2, $3) RETURNING id, user_id, requested_room_id, reason, created_at`,
      [req.user.id, requested_room_id || null, reason]
    );

    res.status(201).json({ success: true, message: "Transfer talebi oluşturuldu", data: result.rows[0] });
  } catch (err) {
    console.error("Transfer talebi hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /students/transfer-requests
// Transfer taleplerini listeler
// ------------------------------------
router.get("/transfer-requests", authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT tr.id, tr.user_id, tr.requested_room_id, tr.reason, tr.created_at,
             u.first_name, u.last_name, u.email
      FROM room_transfer_requests tr
      JOIN public.users u ON tr.user_id = u.id
    `;
    const params = [];
    if (!['Yönetici', 'Admin', 'SuperAdmin'].includes(req.user.user_type)) {
      query += " WHERE tr.user_id = $1";
      params.push(req.user.id);
    }
    query += " ORDER BY tr.created_at DESC";

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Transfer talep listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// PATCH /students/transfer-requests/:id
// Transfer talebini onayla/reddet (Yönetici)
// ------------------------------------
router.patch("/transfer-requests/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const request = await pool.query(
        "SELECT id, user_id, requested_room_id FROM room_transfer_requests WHERE id = $1",
        [req.params.id]
      );

      if (request.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Talep bulunamadı" });
      }

      const { user_id, requested_room_id } = request.rows[0];

      if (requested_room_id) {
        const newRoom = await pool.query(
          "SELECT capacity, current_occupancy FROM rooms WHERE id = $1", [requested_room_id]
        );

        if (newRoom.rows.length === 0 || newRoom.rows[0].current_occupancy >= newRoom.rows[0].capacity) {
          return res.status(400).json({ success: false, message: "Talep edilen oda uygun değil" });
        }

        const oldAssignment = await pool.query(
          "SELECT id, room_id FROM room_assignments WHERE user_id = $1 AND status = 'Aktif'", [user_id]
        );
        if (oldAssignment.rows.length > 0) {
          await pool.query(
            "UPDATE room_assignments SET status = 'Transfer', check_out_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1",
            [oldAssignment.rows[0].id]
          );
          const oldRoom = await pool.query("SELECT current_occupancy FROM rooms WHERE id = $1", [oldAssignment.rows[0].room_id]);
          const oldOcc = Math.max(0, oldRoom.rows[0].current_occupancy - 1);
          await pool.query(
            "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
            [oldOcc, oldOcc === 0 ? 'Boş' : 'Kısmi', oldAssignment.rows[0].room_id]
          );
        }

        await pool.query(
          "INSERT INTO room_assignments (user_id, room_id, assigned_by, notes) VALUES ($1, $2, $3, 'Transfer talebi onaylı')",
          [user_id, requested_room_id, req.user.id]
        );
        const newOcc = newRoom.rows[0].current_occupancy + 1;
        await pool.query(
          "UPDATE rooms SET current_occupancy = $1, status = $2, updated_at = NOW() WHERE id = $3",
          [newOcc, newOcc >= newRoom.rows[0].capacity ? 'Dolu' : 'Kısmi', requested_room_id]
        );
      }

      await pool.query(
        `UPDATE room_transfer_requests SET updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );

      res.json({ success: true, message: "Transfer talebi işlendi" });
    } catch (err) {
      console.error("Transfer talep işleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ============================================================
// DİSİPLİN İŞLEMLERİ
// ============================================================

// ------------------------------------
// POST /students/:id/warnings
// Öğrenciye uyarı verir (Yönetici)
// ------------------------------------
router.post("/:id/warnings",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { warning_type, reason, description, severity, incident_date, expires_at } = req.body;

    if (!warning_type || !reason) {
      return res.status(400).json({ success: false, message: "Uyarı tipi ve sebep zorunlu" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO student_warnings (user_id, warning_type, reason, description, severity, issued_by, incident_date, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.params.id, warning_type, reason, description, severity || 'Orta',
         req.user.id, incident_date || new Date().toISOString().split('T')[0], expires_at]
      );

      res.status(201).json({ message: "Uyarı kaydı oluşturuldu", warning: result.rows[0] });
    } catch (err) {
      console.error("Uyarı oluşturma hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /students/:id/warnings
// Öğrencinin disiplin geçmişi
// ------------------------------------
router.get("/:id/warnings", authenticateToken, async (req, res) => {
  try {
    if (req.user.user_type === 'Öğrenci' && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ success: false, message: "Yetkiniz yok" });
    }

    const result = await pool.query(`
      SELECT sw.*, iu.first_name AS issuer_first, iu.last_name AS issuer_last
      FROM student_warnings sw
      JOIN users iu ON sw.issued_by = iu.id
      WHERE sw.user_id = $1
      ORDER BY sw.created_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    console.error("Uyarı listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ============================================================
// BELGE YÖNETİMİ
// ============================================================

// ------------------------------------
// POST /students/documents
// Belge kaydı oluşturur
// ------------------------------------
router.post("/documents", authenticateToken, async (req, res) => {
  const { document_type, file_name, file_url, file_size, mime_type, expiry_date } = req.body;

  if (!document_type || !file_name) {
    return res.status(400).json({ success: false, message: "Belge tipi ve dosya adı zorunlu" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO student_documents (user_id, document_type, file_name, file_url, file_size, mime_type, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, document_type, file_name, file_url, file_size, mime_type, expiry_date]
    );

    res.status(201).json({ message: "Belge kaydı oluşturuldu", document: result.rows[0] });
  } catch (err) {
    console.error("Belge kayıt hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /students/documents
// Belgeleri listeler
// ------------------------------------
router.get("/documents", authenticateToken, async (req, res) => {
  try {
    let query, params;
    if (['Yönetici', 'Admin', 'SuperAdmin'].includes(req.user.user_type)) {
      const { user_id, status, type } = req.query;
      query = `SELECT sd.*, u.first_name, u.last_name, u.email
               FROM student_documents sd JOIN public.users u ON sd.user_id = u.id WHERE 1=1`;
      params = [];
      let idx = 1;
      if (user_id) { query += ` AND sd.user_id = $${idx++}`; params.push(user_id); }
      if (status) { query += ` AND sd.status = $${idx++}`; params.push(status); }
      if (type) { query += ` AND sd.document_type = $${idx++}`; params.push(type); }
      query += " ORDER BY sd.created_at DESC";
    } else {
      query = "SELECT * FROM student_documents WHERE user_id = $1 ORDER BY created_at DESC";
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Belge listeleme hatası:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// PATCH /students/documents/:id/verify
// Belgeyi onayla/reddet (Yönetici)
// ------------------------------------
router.patch("/documents/:id/verify",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { status, notes } = req.body;

    if (!['Onaylandı', 'Reddedildi'].includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum" });
    }

    try {
      await pool.query(
        `UPDATE student_documents SET status = $1, verified_by = $2, verified_at = NOW(), notes = $3, updated_at = NOW() WHERE id = $4`,
        [status, req.user.id, notes, req.params.id]
      );
      res.json({ message: `Belge ${status === 'Onaylandı' ? 'onaylandı' : 'reddedildi'}` });
    } catch (err) {
      console.error("Belge doğrulama hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
        }
  }
);

module.exports = router;
