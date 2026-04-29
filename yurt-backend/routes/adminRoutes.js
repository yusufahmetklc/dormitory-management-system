// ╔══════════════════════════════════════════════════════════════════╗
// ║  ADMİN ROUTE'LARI (routes/adminRoutes.js)                      ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Kullanıcı yönetimi (sadece Yönetici/Admin/SuperAdmin)           ║
// ║  Kullanıcı listesi, rol değiştirme, şifre sıfırlama             ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET  /admin/users               → Tüm kullanıcıları listele  ║
// ║  PUT  /admin/users/:id/role       → Kullanıcı rolünü değiştir ║
// ║  POST /admin/users/:id/reset-password → Şifre sıfırla          ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

// ------------------------------------
// Yardımcı: Öğrenci numarası üretir
// Format: YYYY + code(3 basamak) + seq(3 basamak) = 10 karakter
// ------------------------------------
async function generateStudentNumber(departmentId) {
  try {
    const year = new Date().getFullYear();
    const deptRes = await pool.query(
      'SELECT name, code FROM public.departments WHERE id = $1',
      [departmentId]
    );
    if (!deptRes.rows.length) return { number: null, name: null };
    const { code, name } = deptRes.rows[0];

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM public.users
       WHERE department_id = $1 AND user_type = 'Öğrenci'
         AND EXTRACT(YEAR FROM create_date) = $2`,
      [departmentId, year]
    );
    const seq = parseInt(countRes.rows[0].count) + 1;
    const number = `${year}${code.padStart(3, '0')}${String(seq).padStart(3, '0')}`;
    return { number, name };
  } catch (e) {
    console.warn('generateStudentNumber error:', e.message);
    return { number: null, name: null };
  }
}

// ------------------------------------
// POST /admin/users
// Yeni kullanıcı oluşturur
// ------------------------------------
router.post("/users",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    let { first_name, last_name, email, password, role, gender, department, student_number } = req.body || {};

    if (!first_name || !last_name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "Tüm alanlar zorunludur" });
    }

    department     = department     ? String(department).trim()     : null;
    student_number = student_number ? String(student_number).trim() : null;

    // Öğrenci numarası format kontrolü (10-12 rakam)
    if (student_number && !/^[0-9]{10,12}$/.test(student_number)) {
      return res.status(400).json({ success: false, message: "Öğrenci numarası 10-12 haneli rakamlardan oluşmalıdır" });
    }

    // Normalize
    first_name = first_name.trim().charAt(0).toUpperCase() + first_name.trim().slice(1);
    last_name  = last_name.trim().charAt(0).toUpperCase() + last_name.trim().slice(1);
    email      = email.trim().toLowerCase();

    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta adresi" });
    }

    const nameRegex = /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/;
    if (!nameRegex.test(first_name)) {
      return res.status(400).json({ success: false, message: "Ad sadece harf içermelidir" });
    }
    if (!nameRegex.test(last_name)) {
      return res.status(400).json({ success: false, message: "Soyad sadece harf içermelidir" });
    }

    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passRegex.test(password)) {
      return res.status(400).json({ success: false, message: "Şifre en az 8 karakter, 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir" });
    }

    const validRoles = ["Öğrenci", "Yönetici", "Güvenlik", "Temizlik", "Bakım", "Admin", "SuperAdmin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Geçersiz rol" });
    }

    // Cinsiyet doğrulama (opsiyonel)
    if (gender && !['male', 'female'].includes(gender)) {
      return res.status(400).json({ success: false, message: "Geçersiz cinsiyet değeri" });
    }

    try {
      // RLS with_check: created_by = (SELECT user_id FROM user_schemas WHERE schema_name = CURRENT_USER)
      // CURRENT_USER = 'belek05', user_schemas'ta user_id=32 → created_by 32 olmalı
      const schemaRow = await pool.query(
        "SELECT user_id FROM user_schemas WHERE schema_name = CURRENT_USER LIMIT 1"
      );
      const createdBy = schemaRow.rows[0]?.user_id ?? null;
      console.log('RLS createdBy:', createdBy, '| CURRENT_USER için user_schemas satırı:', schemaRow.rows);

      const password_hash = await bcrypt.hash(password, 10);
      const username = email.split("@")[0];

      // Öğrenci için bölüm adı ve öğrenci numarası üret
      let department    = null;
      let student_number = null;
      const result = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, user_type, username, is_active, is_email_verified, created_by, create_date, update_date, gender, department, student_number)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7, NOW(), NOW(), $8, $9, $10) RETURNING id`,
        [first_name, last_name, email, password_hash, role, username, createdBy, gender || null, department, student_number]
      );

      const newUserId = result.rows[0].id;

      // user_roles tablosu varsa role_id bulup ekle
      try {
        const roleRow = await pool.query("SELECT id FROM roles WHERE name = $1 LIMIT 1", [role]);
        if (roleRow.rows.length > 0) {
          await pool.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [newUserId, roleRow.rows[0].id]
          );
        }
      } catch (_) {
        // user_roles veya roles tablosu yoksa sessizce geç
      }

      // Öğrenci rolü: student_profiles kaydı oluştur (yalnızca user_id ile)
      if (role === 'Öğrenci') {
        try {
          const existingProfile = await pool.query(
            'SELECT id FROM student_profiles WHERE user_id = $1', [newUserId]
          );
          if (existingProfile.rows.length === 0) {
            await pool.query(
              `INSERT INTO student_profiles (user_id, is_active, created_at, updated_at)
               VALUES ($1, TRUE, NOW(), NOW())`,
              [newUserId]
            );
          }
        } catch (profileErr) {
          console.warn('Öğrenci profili oluşturma uyarısı:', profileErr.message);
        }
      }

      res.json({ success: true, data: { id: newUserId, student_number } });
    } catch (err) {
      console.error("Kullanıcı oluşturma hatası:", err);
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: "Bu e-posta veya kullanıcı adı zaten kullanılıyor" });
      }
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// GET /admin/users
// Tüm kullanıcıları listeler
// Sadece Yönetici yetkilidir
// ------------------------------------
router.get("/users",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      let result;
      try {
        result = await pool.query(`
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            u.email,
            u.username,
            u.is_active,
            COALESCE(r.name, u.user_type) AS role
          FROM public.users u
          LEFT JOIN public.user_roles ur ON ur.user_id = u.id
          LEFT JOIN public.roles r ON r.id = ur.role_id
          ORDER BY
            CASE LOWER(COALESCE(r.name, u.user_type))
              WHEN 'yönetici' THEN 1 WHEN 'admin'    THEN 1 WHEN 'superadmin' THEN 1
              WHEN 'güvenlik' THEN 2
              WHEN 'temizlik' THEN 3
              WHEN 'bakım'    THEN 4 WHEN 'bakim'    THEN 4
              WHEN 'öğrenci'  THEN 5 WHEN 'student'  THEN 5
              ELSE 6
            END,
            u.id DESC
        `);
      } catch (_) {
        // user_roles/roles tablosu yoksa düz sorgula
        result = await pool.query(`
          SELECT id, first_name, last_name, email, username, is_active, user_type AS role
          FROM public.users
          ORDER BY
            CASE LOWER(user_type)
              WHEN 'yönetici' THEN 1 WHEN 'admin'    THEN 1 WHEN 'superadmin' THEN 1
              WHEN 'güvenlik' THEN 2
              WHEN 'temizlik' THEN 3
              WHEN 'bakım'    THEN 4 WHEN 'bakim'    THEN 4
              WHEN 'öğrenci'  THEN 5 WHEN 'student'  THEN 5
              ELSE 6
            END,
            id DESC
        `);
      }

      res.json({ success: true, data: result.rows, users: result.rows });
    } catch (err) {
      console.error("Admin kullanıcı listeleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PATCH /admin/users/:id/role
// Kullanıcının rolünü değiştirir
// Body: { user_type: "Öğrenci" | "Yönetici" | "Güvenlik" | "Temizlik" | "Bakım" }
// ------------------------------------

router.get("/students",
  authenticateToken,
  authorizeRole("Güvenlik", "Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const { gender, unassigned } = req.query;

      const params = [];
      let genderClause     = '';
      let unassignedClause = '';

      if (gender && ['male', 'female'].includes(gender)) {
        params.push(gender);
        genderClause = `AND (u.gender = $${params.length} OR u.gender IS NULL)`;
      }
      if (unassigned === 'true') {
        unassignedClause = 'AND ra.user_id IS NULL';
      }

      const result = await pool.query(`
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.is_active,
          u.gender,
          u.department,
          u.student_number,
          r.room_number,
          b.name AS building_name
        FROM public.users u
        LEFT JOIN room_assignments ra ON ra.user_id = u.id AND ra.is_active = TRUE
        LEFT JOIN rooms r             ON r.id = ra.room_id
        LEFT JOIN buildings b         ON b.id = r.building_id
        WHERE u.user_type = 'Öğrenci'
          ${genderClause}
          ${unassignedClause}
        ORDER BY u.id DESC
      `, params);

      res.json({ students: result.rows });
    } catch (err) {
      console.error("Admin öğrenci listeleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// GET /admin/departments
// Bölüm listesi döner (aktif bölümler)
// ------------------------------------
router.get("/departments",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, code FROM public.departments ORDER BY code ASC`
      );
      res.json({ departments: result.rows });
    } catch (err) {
      console.error("Bölüm listeleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// POST /admin/departments
// Yeni bölüm ekler
// ------------------------------------
router.post("/departments",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { name, code } = req.body || {};
    if (!name || !code) {
      return res.status(400).json({ success: false, message: "Bölüm adı ve kodu zorunludur" });
    }
    if (!/^[0-9]+$/.test(code.toString().trim())) {
      return res.status(400).json({ success: false, message: "Bölüm kodu sadece rakamlardan oluşmalıdır" });
    }
    try {
      const result = await pool.query(
        `INSERT INTO public.departments (name, code) VALUES ($1, $2) RETURNING id, name, code`,
        [name.trim(), code.toString().trim()]
      );
      res.json({ success: true, department: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: "Bu kod zaten kullanılıyor" });
      }
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// DELETE /admin/departments/:id
// Bölümü siler (atanmış öğrenci yoksa)
// ------------------------------------
router.delete("/departments/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const deptId = parseInt(req.params.id);
    try {
      const used = await pool.query(
        `SELECT COUNT(*) FROM public.users WHERE department_id = $1 AND user_type = 'Öğrenci'`,
        [deptId]
      );
      if (parseInt(used.rows[0].count) > 0) {
        return res.status(400).json({ success: false, message: "Bu bölüme kayıtlı öğrenci bulunuyor, silinemez" });
      }
      await pool.query(`DELETE FROM public.departments WHERE id = $1`, [deptId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// DELETE /admin/users/:id
// Kullanıcıyı siler
// ------------------------------------
router.delete("/users/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = req.params.id;
    try {
      const check = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      res.json({ success: true, message: "Kullanıcı silindi" });
    } catch (err) {
      console.error("Kullanıcı silme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// PUT /admin/users/:id/role
// Kullanıcının rolünü değiştirir (PUT alias)
// ------------------------------------
router.put("/users/:id/role",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = req.params.id;
    const { role, user_type: bodyUserType } = req.body || {};
    const newRole = role || bodyUserType;

    const validRoles = ["Öğrenci", "Yönetici", "Güvenlik", "Temizlik", "Bakım"];
    if (!newRole || !validRoles.includes(newRole)) {
      return res.status(400).json({ success: false, message: "Geçersiz rol." });
    }

    try {
      const check = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }
      await pool.query("UPDATE users SET user_type = $1, update_date = NOW() WHERE id = $2", [newRole, userId]);
      res.json({ success: true, data: { newRole } });
    } catch (err) {
      console.error("Rol güncelleme hatası (PUT):", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

router.patch("/users/:id/role",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = req.params.id;
    const { user_type } = req.body || {};

    // Geçerli rol kontrolü
    const validRoles = ["Öğrenci", "Yönetici", "Güvenlik", "Temizlik", "Bakım"];
    if (!user_type || !validRoles.includes(user_type)) {
      return res.status(400).json({
        message: "Geçersiz rol. (Öğrenci, Yönetici, Güvenlik, Temizlik, Bakım)",
      });
    }

    try {
      // Kullanıcının var olup olmadığını kontrol et
      const check = await pool.query(
        "SELECT id, email, user_type, first_name, last_name, username, is_active, password_hash FROM users WHERE id = $1",
        [userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }

      const oldUser = check.rows[0];

      // Aynı rol zaten atanmışsa
      if (oldUser.user_type === user_type) {
        return res.json({ message: "Rol zaten aynı", newRole: user_type });
      }

      // Rolü güncelle — UPDATE yetkisi yoksa DELETE+INSERT workaround kullan
      try {
        await pool.query(
          "UPDATE users SET user_type = $1, update_date = NOW() WHERE id = $2",
          [user_type, userId]
        );
      } catch (updateErr) {
        if (updateErr.code === "42501") {
          // UPDATE yetkisi yok — DELETE+INSERT ile workaround dene
          // Önce DELETE dene
          try {
            await pool.query("DELETE FROM users WHERE id = $1", [userId]);
            // DELETE başarılıysa INSERT yap
            await pool.query(
              `INSERT INTO users (id, username, email, password_hash, first_name, last_name, user_type, is_active, create_date, update_date)
               OVERRIDING SYSTEM VALUE
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
              [userId, oldUser.username, oldUser.email, oldUser.password_hash,
               oldUser.first_name, oldUser.last_name, user_type, oldUser.is_active]
            );
          } catch (deleteErr) {
            // DELETE de yoksa — doğrudan Neon SQL Editor çözümü gerekli
            console.error("UPDATE ve DELETE yetkileri yok:", deleteErr.message);
            return res.status(403).json({
              message: "Veritabanı yetki hatası: UPDATE izni gerekli. Admin grant-update.sql dosyasını çalıştırmalı."
            });
          }
        } else {
          throw updateErr;
        }
      }

      res.json({ message: "Rol güncellendi", newRole: user_type });
    } catch (err) {
      console.error("Rol güncelleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// PATCH /admin/users/:id/reset-password
// Kullanıcının şifresini varsayılan değere sıfırlar
// Varsayılan şifre: YeniSifre123!
// ------------------------------------
router.patch("/users/:id/reset-password",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = req.params.id;

    try {
      // Varsayılan şifreyi hashle
      const newHash = await bcrypt.hash("YeniSifre123!", 10);

      // Önce kullanıcı var mı kontrol et
      const check = await pool.query(
        "SELECT id, username, email, password_hash, first_name, last_name, user_type, is_active FROM users WHERE id = $1",
        [userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }

      const oldUser = check.rows[0];

      // Şifreyi güncelle — UPDATE yetkisi yoksa DELETE+INSERT workaround
      try {
        await pool.query(
          "UPDATE users SET password_hash = $1, update_date = NOW() WHERE id = $2",
          [newHash, userId]
        );
      } catch (updateErr) {
        if (updateErr.code === "42501") {
          try {
            await pool.query("DELETE FROM users WHERE id = $1", [userId]);
            await pool.query(
              `INSERT INTO users (id, username, email, password_hash, first_name, last_name, user_type, is_active, create_date, update_date)
               OVERRIDING SYSTEM VALUE
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
              [userId, oldUser.username, oldUser.email, newHash,
               oldUser.first_name, oldUser.last_name, oldUser.user_type, oldUser.is_active]
            );
          } catch (deleteErr) {
            console.error("UPDATE ve DELETE yetkileri yok:", deleteErr.message);
            return res.status(403).json({
              message: "Veritabanı yetki hatası: UPDATE izni gerekli. Admin grant-update.sql dosyasını çalıştırmalı."
            });
          }
        } else {
          throw updateErr;
        }
      }

      res.json({ message: "Şifre resetlendi." });
    } catch (err) {
      console.error("Şifre reset hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

// ------------------------------------
// PUT /admin/users/:id/password
// Yöneticinin belirlediği yeni şifreyi kullanıcıya atar (mevcut şifre sorulmaz)
// ------------------------------------
router.put("/users/:id/password",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const userId = req.params.id;
    const { newPassword } = req.body || {};

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Şifre en az 6 karakter olmalıdır." });
    }

    try {
      const check = await pool.query(
        "SELECT id, username, email, password_hash, first_name, last_name, user_type, is_active FROM users WHERE id = $1",
        [userId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
      }

      const oldUser = check.rows[0];
      const newHash = await bcrypt.hash(newPassword, 10);

      try {
        await pool.query(
          `UPDATE users SET password_hash = $1, update_date = NOW(),
            password_changed_by = 'admin', password_changed_at = NOW(),
            updated_by = $3 WHERE id = $2`,
          [newHash, userId, req.user.id]
        );
      } catch (updateErr) {
        if (updateErr.code === "42501") {
          try {
            await pool.query("DELETE FROM users WHERE id = $1", [userId]);
            await pool.query(
              `INSERT INTO users (id, username, email, password_hash, first_name, last_name, user_type, is_active, create_date, update_date, password_changed_by, password_changed_at, updated_by)
               OVERRIDING SYSTEM VALUE
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 'admin', NOW(), $9)`,
              [userId, oldUser.username, oldUser.email, newHash,
               oldUser.first_name, oldUser.last_name, oldUser.user_type, oldUser.is_active, req.user.id]
            );
          } catch (deleteErr) {
            console.error("UPDATE ve DELETE yetkileri yok:", deleteErr.message);
            return res.status(403).json({
              message: "Veritabanı yetki hatası: UPDATE izni gerekli."
            });
          }
        } else {
          throw updateErr;
        }
      }

      res.json({ success: true, message: "Şifre başarıyla güncellendi." });
    } catch (err) {
      console.error("Şifre güncelleme hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası: " + err.message });
    }
  }
);

module.exports = router;
