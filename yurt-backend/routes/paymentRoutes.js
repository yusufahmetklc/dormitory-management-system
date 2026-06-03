// ╔══════════════════════════════════════════════════════════════════╗
// ║  ÖDEME YÖNETİMİ ROUTE'LARI (routes/paymentRoutes.js)          ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Yurt ücreti ödeme takibi, borç tanımlama ve raporlama.       ║
// ║                                                                  ║
// ║  ENDPOINT'LER:                                                  ║
// ║  GET    /payments                    → Tüm ödemeleri listele  ║
// ║  GET    /payments/grouped            → Öğrenci bazlı gruplu   ║
// ║  GET    /payments/my                 → Öğrencinin kendi ödeme ║
// ║  GET    /payments/stats              → Ödeme istatistikleri   ║
// ║  POST   /payments                    → Yeni borç kaydı        ║
// ║  PATCH  /payments/:id                → Durum/kısmi ödeme      ║
// ║  PUT    /payments/:id                → Ödeme güncelle         ║
// ║  DELETE /payments/:id                → Ödeme sil              ║
// ║  POST   /payments/monthly-installments → Aylık taksit planı   ║
// ║                                                                  ║
// ║  ÖDEME TÜRLERİ:                                                ║
// ║  Tek seferlik | Taksitli | Aylık | Depozito | Ek ücret | Kısmi ║
// ║                                                                  ║
// ║  DURUM AKIŞI:                                                   ║
// ║  Beklemede → Yaklaşan ödeme (7 gün içinde)                    ║
// ║  Beklemede/Yaklaşan → Gecikmiş (vade geçince)                 ║
// ║  Herhangi biri → Ödendi | Kısmi ödendi                        ║
// ╚══════════════════════════════════════════════════════════════════╝

const express = require("express");
const pool = require("../config/db");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const router = express.Router();

const PAYMENT_TYPES  = ['Tek seferlik', 'Taksitli', 'Aylık', 'Depozito', 'Ek ücret', 'Kısmi'];
const VALID_STATUSES = ['Beklemede', 'Ödendi', 'Gecikmiş', 'Kısmi ödendi', 'Yaklaşan ödeme'];

// NOT: payment_type ve paid_amount sütunları için migrations/014_payment_columns.sql
// dosyasını Neon SQL Editor'da neondb_owner olarak çalıştırın.

// ------------------------------------
// Vadesi geçmiş → Gecikmiş
// Yakında gelecek (7 gün) → Yaklaşan ödeme
// ------------------------------------
async function autoMarkOverdue() {
  try {
    await pool.query(`
      UPDATE payments SET status = 'Gecikmiş', updated_at = NOW()
      WHERE status IN ('Beklemede', 'Yaklaşan ödeme')
        AND payment_date IS NOT NULL
        AND payment_date < CURRENT_DATE
    `);
    await pool.query(`
      UPDATE payments SET status = 'Yaklaşan ödeme', updated_at = NOW()
      WHERE status = 'Beklemede'
        AND payment_date IS NOT NULL
        AND payment_date >= CURRENT_DATE
        AND payment_date <= CURRENT_DATE + INTERVAL '7 days'
    `);
  } catch { /* silent */ }
}

// ════════════════════════════════════════════════════
// POST /payments
// Yeni borç/ödeme kaydı oluşturur (Yönetici)
// Body: { user_id, amount, due_date?, description?, status?, payment_type? }
// ════════════════════════════════════════════════════
router.post("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, amount, due_date, description, status, payment_type } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: "Öğrenci ID ve tutar zorunlu" });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }

    const finalStatus = VALID_STATUSES.includes(status) ? status : 'Beklemede';
    const finalType   = PAYMENT_TYPES.includes(payment_type) ? payment_type : 'Tek seferlik';

    try {
      let result;
      try {
        result = await pool.query(
          `INSERT INTO payments (user_id, amount, status, payment_date, description, payment_type, paid_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0)
           RETURNING id, user_id, amount, status, payment_date, description, created_at`,
          [parseInt(user_id), parseFloat(amount), finalStatus, due_date || null, description || null, finalType]
        );
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          result = await pool.query(
            `INSERT INTO payments (user_id, amount, status, payment_date, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, amount, status, payment_date, description, created_at`,
            [parseInt(user_id), parseFloat(amount), finalStatus, due_date || null, description || null]
          );
        } else { throw colErr; }
      }

      res.status(201).json({ success: true, message: "Ödeme kaydı oluşturuldu", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme kayıt hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ════════════════════════════════════════════════════
// PATCH /payments/:id
// Durum güncelle + kısmi ödeme desteği (Yönetici)
// Body: { status, paid_amount? }
// ════════════════════════════════════════════════════
router.patch("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { status, paid_amount } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Geçersiz durum değeri" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "Geçersiz ID" });

    try {
      let query, params;

      if (status === 'Kısmi ödendi' && paid_amount !== undefined) {
        if (isNaN(Number(paid_amount)) || Number(paid_amount) < 0) {
          return res.status(400).json({ success: false, message: "Geçersiz ödenen tutar" });
        }
        query  = `UPDATE payments SET status = $1, paid_amount = $2, updated_at = NOW()
                  WHERE id = $3 RETURNING id, user_id, amount, status, payment_date, description, updated_at`;
        params = [status, parseFloat(paid_amount), id];
      } else if (status === 'Ödendi') {
        query  = `UPDATE payments SET status = $1, paid_amount = amount, updated_at = NOW()
                  WHERE id = $2 RETURNING id, user_id, amount, status, payment_date, description, updated_at`;
        params = [status, id];
      } else {
        query  = `UPDATE payments SET status = $1, updated_at = NOW()
                  WHERE id = $2 RETURNING id, user_id, amount, status, payment_date, description, updated_at`;
        params = [status, id];
      }

      let result;
      try {
        result = await pool.query(query, params);
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          // Fallback: paid_amount column yok, sadece status güncelle
          const fallback = `UPDATE payments SET status = $1, updated_at = NOW()
                            WHERE id = $2 RETURNING id, user_id, amount, status, payment_date, description, updated_at`;
          result = await pool.query(fallback, [status, id]);
        } else {
          throw colErr;
        }
      }

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme durumu güncellendi", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ════════════════════════════════════════════════════
// GET /payments/grouped
// Öğrenci bazlı gruplu ödeme özeti (Yönetici)
// ════════════════════════════════════════════════════
router.get("/grouped",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await autoMarkOverdue();

      // Tam sorgu (payment_type ve paid_amount sütunları varsa)
      const fullQuery = `
        SELECT
          u.id                                                                           AS user_id,
          u.first_name, u.last_name, u.email,
          COUNT(p.id)                                                                    AS total_count,
          COALESCE(SUM(p.amount), 0)                                                    AS total_debt,
          COALESCE(SUM(
            CASE WHEN p.status = 'Ödendi'
                 THEN p.amount
                 ELSE COALESCE(p.paid_amount, 0) END
          ), 0)                                                                          AS paid_amount,
          COALESCE(SUM(
            CASE WHEN p.status != 'Ödendi'
                 THEN p.amount - COALESCE(p.paid_amount, 0)
                 ELSE 0 END
          ), 0)                                                                          AS remaining,
          COUNT(CASE WHEN p.status = 'Gecikmiş'       THEN 1 END)                      AS overdue_count,
          COUNT(CASE WHEN p.status = 'Beklemede'       THEN 1 END)                     AS pending_count,
          COUNT(CASE WHEN p.status = 'Yaklaşan ödeme' THEN 1 END)                     AS upcoming_count,
          COUNT(CASE WHEN p.status = 'Kısmi ödendi'   THEN 1 END)                     AS partial_count,
          COUNT(CASE WHEN p.status = 'Ödendi'         THEN 1 END)                     AS paid_count,
          MIN(CASE WHEN p.status IN ('Beklemede','Gecikmiş','Yaklaşan ödeme')
                   THEN p.payment_date END)                                             AS next_due_date,
          json_agg(
            json_build_object(
              'id',           p.id,
              'amount',       p.amount,
              'paid_amount',  COALESCE(p.paid_amount, 0),
              'status',       p.status,
              'payment_type', COALESCE(p.payment_type, 'Tek seferlik'),
              'payment_date', p.payment_date,
              'description',  p.description,
              'created_at',   p.created_at
            )
            ORDER BY p.payment_date ASC NULLS LAST, p.created_at DESC
          )                                                                              AS payments
        FROM users u
        JOIN payments p ON p.user_id = u.id
        GROUP BY u.id, u.first_name, u.last_name, u.email
        ORDER BY
          MAX(CASE
            WHEN p.status = 'Gecikmiş'       THEN 0
            WHEN p.status = 'Yaklaşan ödeme' THEN 1
            WHEN p.status = 'Kısmi ödendi'   THEN 2
            WHEN p.status = 'Beklemede'      THEN 3
            ELSE 4
          END),
          u.first_name
      `;

      // Fallback sorgu (payment_type / paid_amount henüz eklenmemişse)
      const fallbackQuery = `
        SELECT
          u.id                                                                           AS user_id,
          u.first_name, u.last_name, u.email,
          COUNT(p.id)                                                                    AS total_count,
          COALESCE(SUM(p.amount), 0)                                                    AS total_debt,
          COALESCE(SUM(CASE WHEN p.status = 'Ödendi' THEN p.amount ELSE 0 END), 0)    AS paid_amount,
          COALESCE(SUM(CASE WHEN p.status != 'Ödendi' THEN p.amount ELSE 0 END), 0)   AS remaining,
          COUNT(CASE WHEN p.status = 'Gecikmiş'       THEN 1 END)                      AS overdue_count,
          COUNT(CASE WHEN p.status = 'Beklemede'       THEN 1 END)                     AS pending_count,
          COUNT(CASE WHEN p.status = 'Yaklaşan ödeme' THEN 1 END)                     AS upcoming_count,
          COUNT(CASE WHEN p.status = 'Kısmi ödendi'   THEN 1 END)                     AS partial_count,
          COUNT(CASE WHEN p.status = 'Ödendi'         THEN 1 END)                     AS paid_count,
          MIN(CASE WHEN p.status IN ('Beklemede','Gecikmiş','Yaklaşan ödeme')
                   THEN p.payment_date END)                                             AS next_due_date,
          json_agg(
            json_build_object(
              'id',           p.id,
              'amount',       p.amount,
              'paid_amount',  CASE WHEN p.status = 'Ödendi' THEN p.amount ELSE 0 END,
              'status',       p.status,
              'payment_type', 'Tek seferlik',
              'payment_date', p.payment_date,
              'description',  p.description,
              'created_at',   p.created_at
            )
            ORDER BY p.payment_date ASC NULLS LAST, p.created_at DESC
          )                                                                              AS payments
        FROM users u
        JOIN payments p ON p.user_id = u.id
        GROUP BY u.id, u.first_name, u.last_name, u.email
        ORDER BY
          MAX(CASE
            WHEN p.status = 'Gecikmiş'       THEN 0
            WHEN p.status = 'Yaklaşan ödeme' THEN 1
            WHEN p.status = 'Kısmi ödendi'   THEN 2
            WHEN p.status = 'Beklemede'      THEN 3
            ELSE 4
          END),
          u.first_name
      `;

      let result;
      try {
        result = await pool.query(fullQuery);
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          result = await pool.query(fallbackQuery);
        } else {
          throw colErr;
        }
      }

      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Gruplu ödeme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ════════════════════════════════════════════════════
// GET /payments
// Ödeme kayıtlarını listeler (Yönetici)
// Query: ?user_id=23
// ════════════════════════════════════════════════════
router.get("/",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await autoMarkOverdue();
      const { user_id } = req.query;

      const params = [];
      let idx = 1;
      const whereClause = user_id ? ` AND p.user_id = $${idx++}` : '';
      if (user_id) params.push(user_id);

      let result;
      try {
        const q = `
          SELECT p.id, p.user_id, p.amount, p.status, p.payment_date,
                 COALESCE(p.paid_amount, 0)              AS paid_amount,
                 COALESCE(p.payment_type,'Tek seferlik') AS payment_type,
                 p.description, p.created_at, p.updated_at,
                 u.first_name, u.last_name, u.email
          FROM payments p
          JOIN users u ON p.user_id = u.id
          WHERE 1=1${whereClause}
          ORDER BY p.payment_date ASC NULLS LAST, p.created_at DESC
        `;
        result = await pool.query(q, params);
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          const q = `
            SELECT p.id, p.user_id, p.amount, p.status, p.payment_date,
                   CASE WHEN p.status='Ödendi' THEN p.amount ELSE 0 END AS paid_amount,
                   'Tek seferlik'::text AS payment_type,
                   p.description, p.created_at, p.updated_at,
                   u.first_name, u.last_name, u.email
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE 1=1${whereClause}
            ORDER BY p.payment_date ASC NULLS LAST, p.created_at DESC
          `;
          result = await pool.query(q, params);
        } else {
          throw colErr;
        }
      }

      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Ödeme listeleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /payments/my
// Öğrencinin kendi ödemeleri
// ------------------------------------
router.get("/my", authenticateToken, async (req, res) => {
  try {
    await autoMarkOverdue();
    let result;
    try {
      result = await pool.query(
        `SELECT id, user_id, amount, status,
                COALESCE(paid_amount, 0)              AS paid_amount,
                COALESCE(payment_type,'Tek seferlik') AS payment_type,
                payment_date, description, created_at
         FROM payments WHERE user_id = $1
         ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
        [req.user.id]
      );
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('does not exist')) {
        result = await pool.query(
          `SELECT id, user_id, amount, status,
                  CASE WHEN status='Ödendi' THEN amount ELSE 0 END AS paid_amount,
                  'Tek seferlik'::text AS payment_type,
                  payment_date, description, created_at
           FROM payments WHERE user_id = $1
           ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
          [req.user.id]
        );
      } else { throw colErr; }
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Ödeme geçmişi hatası:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ------------------------------------
// GET /payments/stats
// Ödeme istatistikleri (Yönetici)
// ------------------------------------
router.get("/stats",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      let stats;
      try {
        stats = await pool.query(`
          SELECT
            COUNT(*)                                                                                AS total_records,
            COALESCE(SUM(amount), 0)                                                               AS total_amount,
            COALESCE(SUM(
              CASE WHEN status = 'Ödendi' THEN amount
                   ELSE COALESCE(paid_amount, 0) END
            ), 0)                                                                                   AS paid_amount,
            COALESCE(SUM(
              CASE WHEN status IN ('Beklemede','Gecikmiş','Kısmi ödendi','Yaklaşan ödeme')
                   THEN amount - COALESCE(paid_amount, 0)
                   ELSE 0 END
            ), 0)                                                                                   AS unpaid_amount,
            COUNT(CASE WHEN status = 'Gecikmiş'       THEN 1 END)                                 AS overdue_count,
            COUNT(CASE WHEN status = 'Yaklaşan ödeme' THEN 1 END)                                AS upcoming_count,
            COUNT(CASE WHEN status = 'Kısmi ödendi'   THEN 1 END)                                AS partial_count,
            COUNT(DISTINCT user_id)                                                                 AS student_count
          FROM payments
        `);
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          stats = await pool.query(`
            SELECT
              COUNT(*)                                                    AS total_records,
              COALESCE(SUM(amount), 0)                                   AS total_amount,
              COALESCE(SUM(CASE WHEN status='Ödendi' THEN amount ELSE 0 END), 0) AS paid_amount,
              COALESCE(SUM(CASE WHEN status!='Ödendi' THEN amount ELSE 0 END), 0) AS unpaid_amount,
              COUNT(CASE WHEN status='Gecikmiş'       THEN 1 END)        AS overdue_count,
              COUNT(CASE WHEN status='Yaklaşan ödeme' THEN 1 END)       AS upcoming_count,
              COUNT(CASE WHEN status='Kısmi ödendi'   THEN 1 END)       AS partial_count,
              COUNT(DISTINCT user_id)                                     AS student_count
            FROM payments
          `);
        } else { throw colErr; }
      }

      res.json({ success: true, data: { summary: stats.rows[0] } });
    } catch (err) {
      console.error("Ödeme istatistik hatası:", err);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// POST /payments/monthly-installments
// Öğrenci için aylık taksit planı oluşturur (Yönetici)
// Body: { user_id, amount, start_date, months, description? }
// ------------------------------------
router.post("/monthly-installments",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { user_id, amount, start_date, months, description } = req.body;

    if (!user_id || !amount || !start_date || !months) {
      return res.status(400).json({ success: false, message: "Öğrenci, tutar, başlangıç tarihi ve ay sayısı zorunlu" });
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }

    const monthCount = parseInt(months);
    if (monthCount < 1 || monthCount > 24) {
      return res.status(400).json({ success: false, message: "Ay sayısı 1-24 arasında olmalı" });
    }

    const startDate = new Date(start_date);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ success: false, message: "Geçersiz başlangıç tarihi" });
    }

    try {
      const insertedIds = [];
      for (let i = 0; i < monthCount; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const desc = description ||
          `Aylık yurt ücreti — ${dueDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;

        let r;
        try {
          r = await pool.query(
            `INSERT INTO payments (user_id, amount, status, payment_date, description, payment_type, paid_amount)
             VALUES ($1, $2, 'Beklemede', $3, $4, 'Aylık', 0) RETURNING id`,
            [parseInt(user_id), parseFloat(amount), dueDateStr, desc]
          );
        } catch (colErr) {
          if (colErr.message && colErr.message.includes('does not exist')) {
            r = await pool.query(
              `INSERT INTO payments (user_id, amount, status, payment_date, description)
               VALUES ($1, $2, 'Beklemede', $3, $4) RETURNING id`,
              [parseInt(user_id), parseFloat(amount), dueDateStr, desc]
            );
          } else { throw colErr; }
        }
        insertedIds.push(r.rows[0].id);
      }

      res.status(201).json({
        success: true,
        message: `${monthCount} aylık taksit planı oluşturuldu`,
        data: { created: monthCount, ids: insertedIds }
      });
    } catch (err) {
      console.error("Taksit oluşturma hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// PUT /payments/:id
// Tutar, vade, açıklama ve türü günceller (Yönetici)
// Body: { amount?, due_date?, description?, payment_type? }
// ------------------------------------
router.put("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const { amount, due_date, description, payment_type } = req.body;
    const id = parseInt(req.params.id);

    if (isNaN(id)) return res.status(400).json({ success: false, message: "Geçersiz ID" });

    if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: "Geçersiz tutar" });
    }
    if (payment_type !== undefined && !PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ success: false, message: "Geçersiz ödeme türü" });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (amount       !== undefined) { fields.push(`amount = $${idx++}`);       values.push(parseFloat(amount)); }
    if (due_date     !== undefined) { fields.push(`payment_date = $${idx++}`); values.push(due_date || null); }
    if (description  !== undefined) { fields.push(`description = $${idx++}`);  values.push(description || null); }
    if (payment_type !== undefined) { fields.push(`payment_type = $${idx++}`); values.push(payment_type); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: "Güncellenecek alan belirtilmedi" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    try {
      let result;
      try {
        result = await pool.query(
          `UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx}
           RETURNING id, user_id, amount, status, paid_amount, payment_date, description, payment_type`,
          values
        );
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          // Sütunlar henüz eklenmemişse, sadece mevcut sütunları güncelle
          const safeFields = fields.filter(f => !f.includes('payment_type') && !f.includes('paid_amount'));
          const safeVals   = values.filter((_, i) => {
            const f = fields[i];
            return f && !f.includes('payment_type') && !f.includes('paid_amount');
          });
          safeVals.push(id);
          const newIdx = safeVals.length;
          result = await pool.query(
            `UPDATE payments SET ${safeFields.join(', ')} WHERE id = $${newIdx}
             RETURNING id, user_id, amount, status, payment_date, description`,
            safeVals
          );
        } else {
          throw colErr;
        }
      }

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme güncellendi", data: result.rows[0] });
    } catch (err) {
      console.error("Ödeme güncelleme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// DELETE /payments/:id
// Ödeme kaydını siler (Yönetici)
// ------------------------------------
router.delete("/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Geçersiz ID" });
    }

    try {
      const result = await pool.query(
        `DELETE FROM payments WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: "Ödeme bulunamadı" });
      }

      res.json({ success: true, message: "Ödeme silindi" });
    } catch (err) {
      console.error("Ödeme silme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

// ------------------------------------
// GET /payments/user/:id
// Belirli bir öğrencinin ödemeleri (Yönetici)
// ------------------------------------
router.get("/user/:id",
  authenticateToken,
  authorizeRole("Yönetici", "Admin", "SuperAdmin"),
  async (req, res) => {
    try {
      await autoMarkOverdue();
      let result;
      try {
        result = await pool.query(
          `SELECT id, user_id, amount, status,
                  COALESCE(paid_amount, 0)              AS paid_amount,
                  COALESCE(payment_type,'Tek seferlik') AS payment_type,
                  payment_date, description, created_at
           FROM payments WHERE user_id = $1
           ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
          [parseInt(req.params.id)]
        );
      } catch (colErr) {
        if (colErr.message && colErr.message.includes('does not exist')) {
          result = await pool.query(
            `SELECT id, user_id, amount, status,
                    CASE WHEN status='Ödendi' THEN amount ELSE 0 END AS paid_amount,
                    'Tek seferlik'::text AS payment_type,
                    payment_date, description, created_at
             FROM payments WHERE user_id = $1
             ORDER BY payment_date ASC NULLS LAST, created_at DESC`,
            [parseInt(req.params.id)]
          );
        } else { throw colErr; }
      }
      res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error("Kullanıcı ödeme hatası:", err.message);
      res.status(500).json({ success: false, message: "Sunucu hatası" });
    }
  }
);

module.exports = router;
